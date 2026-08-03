import { PostizProviderError, type PostizProviderErrorCode } from "./errors.js";
import { buildPostizSchedulePayload } from "./payload.js";
import type {
  CancelScheduledPostResult,
  PostizConnectionStatus,
  PostizProvider,
  RemotePostStatusResult,
  SchedulePostResult,
  UploadedMedia
} from "./provider.js";
import { redactPostizSecrets } from "./redaction.js";
import type {
  AnalyticsMetric,
  AnalyticsWindow,
  GetPostStatusInput,
  ListIntegrationsOptions,
  ListPostsQuery,
  PostizIntegration,
  PostizListedPost,
  PostizNotificationsResponse,
  SchedulePostInput,
  UploadMediaInput
} from "./schemas.js";
import {
  analyticsResponseSchema,
  analyticsWindowSchema,
  getPostStatusInputSchema,
  listIntegrationsOptionsSchema,
  listPostsQuerySchema,
  postizConnectionResponseSchema,
  postizCreatePostResponseSchema,
  postizIntegrationsResponseSchema,
  postizListPostsResponseSchema,
  postizNotificationsResponseSchema,
  postizStatusResponseSchema,
  postizUploadResponseSchema,
  schedulePostInputSchema,
  toIsoString,
  uploadMediaInputSchema
} from "./schemas.js";
import type { z } from "zod";

export interface RealPostizProviderOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  allowInsecureHttp?: boolean;
}

interface RawJsonResult {
  parsed: boolean;
  value: unknown;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_ERROR_BODY_LENGTH = 4_000;
const MAX_RESPONSE_BODY_LENGTH = 10_000_000;

function normalizeBaseUrl(baseUrl: string, allowInsecureHttp: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("POSTIZ_BASE_URL doit être une URL absolue valide.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("POSTIZ_BASE_URL ne doit contenir aucun identifiant.");
  }
  if (parsed.protocol !== "https:" && !(allowInsecureHttp && parsed.protocol === "http:")) {
    throw new Error("POSTIZ_BASE_URL doit utiliser HTTPS.");
  }
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  if (!parsed.pathname.endsWith("/public/v1")) {
    throw new Error("POSTIZ_BASE_URL doit se terminer par /public/v1.");
  }
  return parsed.toString().replace(/\/$/u, "");
}

function errorCodeForStatus(status: number): PostizProviderErrorCode {
  if (status === 401) return "AUTHENTICATION_FAILED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 400 && status < 500) return "VALIDATION_FAILED";
  return "REMOTE_ERROR";
}

function parseRetryAfter(value: string | null, now: Date): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.max(0, date.getTime() - now.getTime());
}

export class RealPostizProvider implements PostizProvider {
  readonly provider = "postiz" as const;
  readonly mode = "real" as const;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: RealPostizProviderOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error("POSTIZ_API_KEY est requise en mode réel.");
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
      throw new Error("Le timeout Postiz doit être compris entre 1 000 et 120 000 ms.");
    }
    const fetcher = options.fetch ?? globalThis.fetch;
    if (!fetcher) throw new Error("Une implémentation de fetch est requise.");

    this.baseUrl = normalizeBaseUrl(options.baseUrl, options.allowInsecureHttp ?? false);
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
  }

  async testConnection(): Promise<PostizConnectionStatus> {
    const response = await this.requestValidated(
      "testConnection",
      "/is-connected",
      { method: "GET" },
      postizConnectionResponseSchema
    );
    return { connected: response.connected, provider: "postiz", mode: "real" };
  }

  async listIntegrations(
    options: ListIntegrationsOptions = {}
  ): Promise<readonly PostizIntegration[]> {
    const validated = listIntegrationsOptionsSchema.parse(options);
    const query = validated.groupId ? `?group=${encodeURIComponent(validated.groupId)}` : "";
    return this.requestValidated(
      "listIntegrations",
      `/integrations${query}`,
      { method: "GET" },
      postizIntegrationsResponseSchema
    );
  }

  async uploadMedia(input: UploadMediaInput): Promise<UploadedMedia> {
    const validated = uploadMediaInputSchema.parse(input);
    const form = new FormData();
    const typedBlob = validated.file.slice(0, validated.file.size, validated.contentType);
    form.append("file", typedBlob, validated.fileName);
    const response = await this.requestValidated(
      "uploadMedia",
      "/upload",
      { method: "POST", body: form },
      postizUploadResponseSchema,
      true
    );
    return {
      id: response.id,
      path: response.path,
      contentType: validated.contentType,
      name: response.name ?? validated.fileName,
      size: validated.file.size
    };
  }

  async schedulePost(input: SchedulePostInput): Promise<SchedulePostResult> {
    const validated = schedulePostInputSchema.parse(input);
    const payload = buildPostizSchedulePayload(validated);
    let response: Response;
    try {
      response = await this.execute("/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      return this.ambiguousScheduleResult("La réponse réseau de Postiz est indéterminée.", error);
    }

    if (!response.ok) {
      if (response.status === 408 || response.status >= 500) {
        await this.consumeBody(response);
        return this.ambiguousScheduleResult(
          `Postiz a répondu ${response.status}; la création distante doit être vérifiée.`
        );
      }
      throw await this.createHttpError("schedulePost", response, false);
    }

    const body = await this.readJson(response);
    const parsed = body.parsed ? postizCreatePostResponseSchema.safeParse(body.value) : undefined;
    if (
      !parsed?.success ||
      parsed.data.length !== 1 ||
      parsed.data[0]?.integration !== validated.integrationId
    ) {
      return this.ambiguousScheduleResult(
        "Postiz a accepté la requête mais sa réponse de création n'est pas exploitable.",
        parsed?.error
      );
    }

    return {
      outcome: "SCHEDULED",
      remotePosts: parsed.data.map((post) => ({
        remotePostId: post.postId,
        integrationId: post.integration
      })),
      scheduledAt: payload.date
    };
  }

  async cancelScheduledPost(remotePostId: string): Promise<CancelScheduledPostResult> {
    const normalizedId = remotePostId.trim();
    if (!normalizedId) {
      throw new PostizProviderError("L'identifiant distant est requis.", {
        code: "VALIDATION_FAILED",
        operation: "cancelScheduledPost",
        retryable: false,
        remoteStateMayHaveChanged: false
      });
    }

    let response: Response;
    try {
      response = await this.execute(`/posts/${encodeURIComponent(normalizedId)}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" })
      });
    } catch (error) {
      return this.ambiguousCancellationResult(
        normalizedId,
        "La réponse réseau est indéterminée.",
        error
      );
    }

    if (!response.ok) {
      if (response.status === 408 || response.status >= 500) {
        await this.consumeBody(response);
        return this.ambiguousCancellationResult(
          normalizedId,
          `Postiz a répondu ${response.status}; l'annulation distante doit être vérifiée.`
        );
      }
      throw await this.createHttpError("cancelScheduledPost", response, false);
    }

    const body = await this.readJson(response);
    const parsed = body.parsed ? postizStatusResponseSchema.safeParse(body.value) : undefined;
    if (!parsed?.success || parsed.data.id !== normalizedId || parsed.data.state !== "DRAFT") {
      return this.ambiguousCancellationResult(
        normalizedId,
        "Postiz a accepté l'annulation mais sa réponse n'en confirme pas l'état.",
        parsed?.error
      );
    }
    return { outcome: "CANCELLED", remotePostId: normalizedId, remoteState: "DRAFT" };
  }

  async listPosts(query: ListPostsQuery): Promise<readonly PostizListedPost[]> {
    const validated = listPostsQuerySchema.parse(query);
    const parameters = new URLSearchParams({
      startDate: toIsoString(validated.startDate),
      endDate: toIsoString(validated.endDate)
    });
    if (validated.customerId) parameters.set("customer", validated.customerId);
    const response = await this.requestValidated(
      "listPosts",
      `/posts?${parameters.toString()}`,
      { method: "GET" },
      postizListPostsResponseSchema
    );
    return response.posts;
  }

  async getPostStatus(input: GetPostStatusInput): Promise<RemotePostStatusResult> {
    const validated = getPostStatusInputSchema.parse(input);
    const posts = await this.listPosts({
      startDate: validated.startDate,
      endDate: validated.endDate
    });
    const post = posts.find((candidate) => candidate.id === validated.remotePostId);
    const limitation =
      "L'API publique Postiz ne documente ni statut individuel autoritatif, ni erreur structurée, ni webhook sortant.";

    if (!post) {
      return {
        remotePostId: validated.remotePostId,
        status: "UNKNOWN_REMOTE_STATE",
        certainty: "UNKNOWN",
        supportsAuthoritativeRemoteStatus: false,
        limitation
      };
    }
    if (post.releaseURL) {
      return {
        remotePostId: post.id,
        status: "PUBLISHED",
        certainty: "INFERRED",
        supportsAuthoritativeRemoteStatus: false,
        evidence: "RELEASE_URL",
        post,
        limitation
      };
    }
    if (new Date(post.publishDate).getTime() > Date.now()) {
      return {
        remotePostId: post.id,
        status: "SCHEDULED",
        certainty: "INFERRED",
        supportsAuthoritativeRemoteStatus: false,
        evidence: "FUTURE_PUBLISH_DATE",
        post,
        limitation
      };
    }
    return {
      remotePostId: post.id,
      status: "UNKNOWN_REMOTE_STATE",
      certainty: "UNKNOWN",
      supportsAuthoritativeRemoteStatus: false,
      post,
      limitation
    };
  }

  async getIntegrationAnalytics(
    integrationId: string,
    days: AnalyticsWindow
  ): Promise<readonly AnalyticsMetric[]> {
    const normalizedId = this.requiredId(integrationId, "getIntegrationAnalytics");
    const window = analyticsWindowSchema.parse(days);
    return this.requestValidated(
      "getIntegrationAnalytics",
      `/analytics/${encodeURIComponent(normalizedId)}?date=${window}`,
      { method: "GET" },
      analyticsResponseSchema
    );
  }

  async getPostAnalytics(
    remotePostId: string,
    days: AnalyticsWindow
  ): Promise<readonly AnalyticsMetric[]> {
    const normalizedId = this.requiredId(remotePostId, "getPostAnalytics");
    const window = analyticsWindowSchema.parse(days);
    return this.requestValidated(
      "getPostAnalytics",
      `/analytics/post/${encodeURIComponent(normalizedId)}?date=${window}`,
      { method: "GET" },
      analyticsResponseSchema
    );
  }

  async listNotifications(page = 0): Promise<PostizNotificationsResponse> {
    if (!Number.isInteger(page) || page < 0) {
      throw new PostizProviderError("Le numéro de page de notifications est invalide.", {
        code: "VALIDATION_FAILED",
        operation: "listNotifications",
        retryable: false,
        remoteStateMayHaveChanged: false
      });
    }
    return this.requestValidated(
      "listNotifications",
      `/notifications?page=${page}`,
      { method: "GET" },
      postizNotificationsResponseSchema
    );
  }

  private async requestValidated<T>(
    operation: string,
    path: string,
    init: RequestInit,
    schema: z.ZodType<T>,
    remoteStateMayHaveChanged = false
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.execute(path, init);
    } catch (error) {
      throw new PostizProviderError("Postiz est temporairement injoignable.", {
        code: "NETWORK_ERROR",
        operation,
        retryable: true,
        remoteStateMayHaveChanged,
        details: redactPostizSecrets(error, [this.apiKey])
      });
    }
    if (!response.ok)
      throw await this.createHttpError(operation, response, remoteStateMayHaveChanged);

    const body = await this.readJson(response);
    if (!body.parsed) {
      throw new PostizProviderError("Postiz a renvoyé une réponse non JSON.", {
        code: "INVALID_RESPONSE",
        operation,
        retryable: false,
        remoteStateMayHaveChanged,
        details: redactPostizSecrets(body.value, [this.apiKey])
      });
    }
    const parsed = schema.safeParse(body.value);
    if (!parsed.success) {
      throw new PostizProviderError("Le format de réponse Postiz n'est pas reconnu.", {
        code: "INVALID_RESPONSE",
        operation,
        retryable: false,
        remoteStateMayHaveChanged,
        details: redactPostizSecrets(parsed.error.issues, [this.apiKey])
      });
    }
    return parsed.data;
  }

  private async execute(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set("Authorization", this.apiKey);
      headers.set("Accept", "application/json");
      return await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
        redirect: "error",
        cache: "no-store"
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async createHttpError(
    operation: string,
    response: Response,
    remoteStateMayHaveChanged: boolean
  ): Promise<PostizProviderError> {
    const body = await this.readJson(response, MAX_ERROR_BODY_LENGTH);
    const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), new Date());
    return new PostizProviderError(`La requête Postiz a échoué (${response.status}).`, {
      code: errorCodeForStatus(response.status),
      operation,
      retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      remoteStateMayHaveChanged,
      statusCode: response.status,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      details: redactPostizSecrets(body.value, [this.apiKey])
    });
  }

  private async readJson(
    response: Response,
    maxLength = MAX_RESPONSE_BODY_LENGTH
  ): Promise<RawJsonResult> {
    const text = await response.text();
    if (!text) return { parsed: true, value: null };
    if (text.length > maxLength) {
      return {
        parsed: false,
        value: `[Réponse Postiz omise : ${text.length} caractères]`
      };
    }
    try {
      return { parsed: true, value: JSON.parse(text) as unknown };
    } catch {
      return { parsed: false, value: text.slice(0, MAX_ERROR_BODY_LENGTH) };
    }
  }

  private async consumeBody(response: Response): Promise<void> {
    try {
      await response.text();
    } catch {
      // The outcome is already considered ambiguous; body errors add no safe information.
    }
  }

  private ambiguousScheduleResult(reason: string, _details?: unknown): SchedulePostResult {
    return {
      outcome: "UNKNOWN_REMOTE_STATE",
      remotePosts: [],
      retryAllowed: false,
      reason
    };
  }

  private ambiguousCancellationResult(
    remotePostId: string,
    reason: string,
    _details?: unknown
  ): CancelScheduledPostResult {
    return {
      outcome: "UNKNOWN_REMOTE_STATE",
      remotePostId,
      retryAllowed: false,
      reason
    };
  }

  private requiredId(value: string, operation: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new PostizProviderError("L'identifiant distant est requis.", {
        code: "VALIDATION_FAILED",
        operation,
        retryable: false,
        remoteStateMayHaveChanged: false
      });
    }
    return normalized;
  }
}
