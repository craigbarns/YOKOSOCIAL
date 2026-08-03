/* eslint-disable @typescript-eslint/require-await -- The deterministic mock mirrors an async provider without I/O. */

import { PostizProviderError } from "./errors.js";
import type {
  CancelScheduledPostResult,
  PostizConnectionStatus,
  PostizProvider,
  RemotePostStatusResult,
  SchedulePostResult,
  UploadedMedia
} from "./provider.js";
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
  analyticsWindowSchema,
  getPostStatusInputSchema,
  listIntegrationsOptionsSchema,
  listPostsQuerySchema,
  schedulePostInputSchema,
  toIsoString,
  uploadMediaInputSchema
} from "./schemas.js";

export type MockScheduleScenario =
  "success" | "submission_error" | "ambiguous" | "publication_error";

export interface MockPostizProviderOptions {
  now?: () => Date;
  integrations?: readonly PostizIntegration[];
  scheduleScenarios?: readonly MockScheduleScenario[];
  defaultScheduleScenario?: MockScheduleScenario;
}

interface StoredMockPost {
  id: string;
  integrationId: string;
  identifier: string;
  integrationName: string;
  content: string;
  scheduledAt: string;
  releaseUrl: string | undefined;
  status: "SCHEDULED" | "PUBLISHED" | "FAILED" | "CANCELLED";
  publicationWillFail: boolean;
}

const DEFAULT_INTEGRATIONS: readonly PostizIntegration[] = [
  {
    id: "mock-instagram-yokosushi",
    name: "YokoSushi Instagram (DÉMO)",
    identifier: "instagram",
    picture: "https://mock.postiz.invalid/instagram.png",
    disabled: false,
    profile: "yokosushi_demo"
  },
  {
    id: "mock-facebook-yokosushi",
    name: "YokoSushi Facebook (DÉMO)",
    identifier: "facebook",
    picture: "https://mock.postiz.invalid/facebook.png",
    disabled: false,
    profile: "YokoSushi Démo"
  }
];

const MOCK_PLATFORM_ANALYTICS: readonly AnalyticsMetric[] = [
  {
    label: "Followers",
    data: [
      { total: "1240", date: "2026-07-27" },
      { total: "1280", date: "2026-08-02" }
    ],
    percentageChange: 3.2
  },
  {
    label: "Impressions",
    data: [
      { total: "5100", date: "2026-07-27" },
      { total: "5520", date: "2026-08-02" }
    ],
    percentageChange: 8.2
  }
];

const MOCK_POST_ANALYTICS: readonly AnalyticsMetric[] = [
  {
    label: "Likes",
    data: [
      { total: "84", date: "2026-08-01" },
      { total: "96", date: "2026-08-02" }
    ],
    percentageChange: 14.3
  },
  {
    label: "Comments",
    data: [
      { total: "7", date: "2026-08-01" },
      { total: "9", date: "2026-08-02" }
    ],
    percentageChange: 28.6
  }
];

function cloneMetrics(metrics: readonly AnalyticsMetric[]): AnalyticsMetric[] {
  return metrics.map((metric) => ({
    ...metric,
    data: metric.data.map((entry) => ({ ...entry }))
  }));
}

export class MockPostizProvider implements PostizProvider {
  readonly provider = "postiz" as const;
  readonly mode = "mock" as const;

  private readonly now: () => Date;
  private readonly integrations: readonly PostizIntegration[];
  private readonly defaultScheduleScenario: MockScheduleScenario;
  private readonly scheduleScenarios: MockScheduleScenario[];
  private readonly posts = new Map<string, StoredMockPost>();
  private uploadSequence = 0;
  private postSequence = 0;

  constructor(options: MockPostizProviderOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.integrations = options.integrations ?? DEFAULT_INTEGRATIONS;
    this.scheduleScenarios = [...(options.scheduleScenarios ?? [])];
    this.defaultScheduleScenario = options.defaultScheduleScenario ?? "success";
  }

  async testConnection(): Promise<PostizConnectionStatus> {
    return { connected: true, provider: "postiz", mode: "mock" };
  }

  async listIntegrations(
    options: ListIntegrationsOptions = {}
  ): Promise<readonly PostizIntegration[]> {
    const validated = listIntegrationsOptionsSchema.parse(options);
    return this.integrations
      .filter((integration) => !validated.groupId || integration.customer?.id === validated.groupId)
      .map((integration) => ({
        ...integration,
        ...(integration.customer ? { customer: { ...integration.customer } } : {})
      }));
  }

  async uploadMedia(input: UploadMediaInput): Promise<UploadedMedia> {
    const validated = uploadMediaInputSchema.parse(input);
    this.uploadSequence += 1;
    const id = `mock-media-${String(this.uploadSequence).padStart(4, "0")}`;
    return {
      id,
      path: `https://mock.postiz.invalid/uploads/${id}/${encodeURIComponent(validated.fileName)}`,
      contentType: validated.contentType,
      name: validated.fileName,
      size: validated.file.size
    };
  }

  async schedulePost(input: SchedulePostInput): Promise<SchedulePostResult> {
    const validated = schedulePostInputSchema.parse(input);
    const integration = this.integrations.find(
      (candidate) => candidate.id === validated.integrationId
    );
    if (!integration || integration.disabled || integration.identifier !== validated.identifier) {
      throw new PostizProviderError("Le compte social de démonstration est indisponible.", {
        code: "VALIDATION_FAILED",
        operation: "schedulePost",
        retryable: false,
        remoteStateMayHaveChanged: false
      });
    }

    const scenario = this.scheduleScenarios.shift() ?? this.defaultScheduleScenario;
    if (scenario === "submission_error") {
      throw new PostizProviderError("Erreur Postiz simulée avant programmation.", {
        code: "VALIDATION_FAILED",
        operation: "schedulePost",
        retryable: false,
        remoteStateMayHaveChanged: false,
        statusCode: 422,
        details: { demo: true, reason: "simulated_submission_error" }
      });
    }

    this.postSequence += 1;
    const remotePostId = `mock-post-${String(this.postSequence).padStart(4, "0")}`;
    const stored: StoredMockPost = {
      id: remotePostId,
      integrationId: integration.id,
      identifier: integration.identifier,
      integrationName: integration.name,
      content: validated.content,
      scheduledAt: toIsoString(validated.scheduledAt),
      releaseUrl: undefined,
      status: "SCHEDULED",
      publicationWillFail: scenario === "publication_error"
    };
    this.posts.set(remotePostId, stored);

    if (scenario === "ambiguous") {
      return {
        outcome: "UNKNOWN_REMOTE_STATE",
        remotePosts: [],
        retryAllowed: false,
        reason:
          "La réponse simulée est ambiguë. Le post distant existe peut-être : vérifier avant toute nouvelle tentative."
      };
    }

    return {
      outcome: "SCHEDULED",
      remotePosts: [{ remotePostId, integrationId: integration.id }],
      scheduledAt: stored.scheduledAt
    };
  }

  async cancelScheduledPost(remotePostId: string): Promise<CancelScheduledPostResult> {
    const normalizedId = remotePostId.trim();
    const post = this.posts.get(normalizedId);
    if (!post) {
      throw new PostizProviderError("Publication Postiz de démonstration introuvable.", {
        code: "NOT_FOUND",
        operation: "cancelScheduledPost",
        retryable: false,
        remoteStateMayHaveChanged: false,
        statusCode: 404
      });
    }
    if (post.status !== "SCHEDULED") {
      throw new PostizProviderError(
        "Seule une publication de démonstration programmée peut être annulée.",
        {
          code: "VALIDATION_FAILED",
          operation: "cancelScheduledPost",
          retryable: false,
          remoteStateMayHaveChanged: false,
          statusCode: 409
        }
      );
    }
    post.status = "CANCELLED";
    post.releaseUrl = undefined;
    return { outcome: "CANCELLED", remotePostId: normalizedId, remoteState: "DRAFT" };
  }

  async listPosts(query: ListPostsQuery): Promise<readonly PostizListedPost[]> {
    const validated = listPostsQuerySchema.parse(query);
    this.refreshDuePosts();
    const start = new Date(toIsoString(validated.startDate)).getTime();
    const end = new Date(toIsoString(validated.endDate)).getTime();

    return [...this.posts.values()]
      .filter((post) => {
        const scheduledAt = new Date(post.scheduledAt).getTime();
        return scheduledAt >= start && scheduledAt <= end && post.status !== "CANCELLED";
      })
      .map((post) => this.toListedPost(post));
  }

  async getPostStatus(input: GetPostStatusInput): Promise<RemotePostStatusResult> {
    const validated = getPostStatusInputSchema.parse(input);
    this.refreshDuePosts();
    const post = this.posts.get(validated.remotePostId);
    if (!post) {
      return {
        remotePostId: validated.remotePostId,
        status: "UNKNOWN_REMOTE_STATE",
        certainty: "UNKNOWN",
        supportsAuthoritativeRemoteStatus: true,
        limitation: "Aucune publication de démonstration ne correspond à cet identifiant."
      };
    }
    return {
      remotePostId: post.id,
      status: post.status,
      certainty: "CONFIRMED",
      supportsAuthoritativeRemoteStatus: true,
      evidence: "MOCK_STATE",
      post: this.toListedPost(post)
    };
  }

  async getIntegrationAnalytics(
    integrationId: string,
    days: AnalyticsWindow
  ): Promise<readonly AnalyticsMetric[]> {
    analyticsWindowSchema.parse(days);
    if (!this.integrations.some((integration) => integration.id === integrationId)) {
      throw new PostizProviderError("Compte social de démonstration introuvable.", {
        code: "NOT_FOUND",
        operation: "getIntegrationAnalytics",
        retryable: false,
        remoteStateMayHaveChanged: false,
        statusCode: 404
      });
    }
    return cloneMetrics(MOCK_PLATFORM_ANALYTICS);
  }

  async getPostAnalytics(
    remotePostId: string,
    days: AnalyticsWindow
  ): Promise<readonly AnalyticsMetric[]> {
    analyticsWindowSchema.parse(days);
    this.refreshDuePosts();
    const post = this.posts.get(remotePostId);
    if (!post || post.status !== "PUBLISHED") return [];
    return cloneMetrics(MOCK_POST_ANALYTICS);
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
    this.refreshDuePosts();
    const notifications = [...this.posts.values()]
      .filter((post) => post.status === "PUBLISHED" || post.status === "FAILED")
      .map((post) => ({
        id: `notification-${post.id}`,
        content:
          post.status === "PUBLISHED"
            ? `Publication de démonstration réussie sur ${post.integrationName}`
            : `Échec simulé de publication sur ${post.integrationName}`,
        link: post.releaseUrl ?? null,
        createdAt: post.scheduledAt
      }));

    return {
      notifications: page === 0 ? notifications : [],
      total: notifications.length,
      page,
      limit: 100,
      hasMore: false
    };
  }

  private refreshDuePosts(): void {
    const now = this.now().getTime();
    for (const post of this.posts.values()) {
      if (post.status !== "SCHEDULED" || new Date(post.scheduledAt).getTime() > now) continue;
      if (post.publicationWillFail) {
        post.status = "FAILED";
      } else {
        post.status = "PUBLISHED";
        post.releaseUrl = `https://mock.postiz.invalid/posts/${post.id}`;
      }
    }
  }

  private toListedPost(post: StoredMockPost): PostizListedPost {
    return {
      id: post.id,
      content: post.content,
      publishDate: post.scheduledAt,
      ...(post.releaseUrl ? { releaseURL: post.releaseUrl } : {}),
      integration: {
        id: post.integrationId,
        providerIdentifier: post.identifier,
        name: post.integrationName,
        picture: `https://mock.postiz.invalid/${post.identifier}.png`
      }
    };
  }
}
