import { createHash } from "node:crypto";

import {
  PostizProviderError,
  redactPostizSecrets,
  type PostizProvider,
  type PostizTargetIdentifier,
  type RemotePostStatusResult,
  type RemotePublicationStatus,
  type UploadedMedia
} from "@yokosocial/postiz";
import type { TenantJobPayload } from "@yokosocial/shared";

import {
  PublicationMediaLoadError,
  type PublicationMediaLoader,
  type PublicationMediaSource
} from "./publication-media-loader.js";

export type PublicationPhase = "schedule" | "reconcile";
export type StoredPublicationJobStatus =
  "PENDING" | "SCHEDULED" | "PROCESSING" | "PUBLISHED" | "FAILED" | "CANCELLED" | "UNCERTAIN";
export type StoredPublicationAttemptStatus =
  "STARTED" | "SUCCEEDED" | "FAILED" | "RETRY_SCHEDULED" | "UNCERTAIN" | "CANCELLED";

export type PublicationContext = {
  jobId: string;
  organizationId: string;
  socialPostId: string;
  socialAccountId: string;
  jobStatus: StoredPublicationJobStatus;
  providerName: string;
  platform: "INSTAGRAM" | "FACEBOOK";
  scheduledAt: Date;
  externalId: string | null;
  remoteStatus: string | null;
  attemptsCount: number;
  idempotencyKey: string;
  post: {
    status: string;
    format: "IMAGE" | "CAROUSEL" | "STORY" | "REEL";
    platforms: readonly ("INSTAGRAM" | "FACEBOOK")[];
    instagramCaption: string | null;
    facebookCaption: string | null;
    callToAction: string;
    hashtags: readonly string[];
    currentVersionNumber: number;
    approvedAt: Date | null;
    currentVersion: { id: string; versionNumber: number; createdAt: Date } | null;
  };
  account: {
    status: string;
    provider: string;
    platform: "INSTAGRAM" | "FACEBOOK";
    remoteIntegrationId: string | null;
    providerIdentifier: string | null;
  };
  establishments: readonly {
    id: string;
    organizationId: string;
    linkOrganizationId: string;
    status: string;
    validationStatus: string;
    updatedAt: Date;
    linkedAt: Date;
  }[];
  media: readonly PublicationMediaSource[];
};

export type StartedPublicationAttempt = {
  kind: "STARTED";
  context: PublicationContext;
  attemptNumber: number;
};

export type PublicationAttemptStartResult =
  | StartedPublicationAttempt
  | { kind: "MISSING" }
  | { kind: "ALREADY_RUNNING"; jobId: string }
  | { kind: "DEFERRED"; jobId: string; retryAt: Date }
  | { kind: "TERMINAL"; jobId: string; status: StoredPublicationJobStatus }
  | { kind: "ALREADY_SCHEDULED"; context: PublicationContext };

export type SafePublicationJson =
  null | boolean | number | string | SafePublicationJson[] | { [key: string]: SafePublicationJson };

export type RecordPublicationOutcomeInput = {
  organizationId: string;
  jobId: string;
  socialPostId: string;
  attemptNumber: number;
  attemptStatus: StoredPublicationAttemptStatus;
  jobStatus: StoredPublicationJobStatus;
  sanitizedPayload: SafePublicationJson;
  sanitizedResponse?: SafePublicationJson;
  httpStatus?: number;
  externalId?: string;
  remoteStatus?: string;
  publishedAt?: Date;
  nextAttemptAt?: Date;
  uncertainSince?: Date;
  errorCode?: string;
  errorMessage?: string;
  remoteStatusCheckedAt?: Date;
  postStatus?: "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "CANCELLED";
};

export interface PublicationJobRepository {
  startAttempt(
    payload: TenantJobPayload,
    phase: PublicationPhase,
    startedAt: Date
  ): Promise<PublicationAttemptStartResult>;
  recordOutcome(input: RecordPublicationOutcomeInput): Promise<void>;
}

export interface PublicationReconciliationPublisher {
  publish(payload: TenantJobPayload, runAt: Date): Promise<void>;
}

export class PublicationProcessingError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly retryAt?: Date
  ) {
    super("Le traitement de la publication a échoué.");
    this.name = "PublicationProcessingError";
  }
}

class PublicationValidationError extends Error {
  constructor(readonly code: string) {
    super("La publication n’est plus valide pour la programmation.");
    this.name = "PublicationValidationError";
  }
}

type SafeFailure = {
  code: string;
  message: string;
  retryable: boolean;
  statusCode?: number;
  retryAfterMs?: number;
  remoteStateMayHaveChanged: boolean;
};

const RECONCILIATION_GRACE_MS = 60_000;
const RECONCILIATION_POLL_MS = 5 * 60_000;
const MAX_RETRY_DELAY_MS = 15 * 60_000;
const DEFERRED_RETRY_MS = 5_000;
const MOCK_SCHEDULED_SUCCESS = "MOCK_SCHEDULED_SUCCESS";
const MOCK_SCHEDULED_FAILURE = "MOCK_SCHEDULED_FAILURE";

export type PublicationProcessorOptions = {
  realOrganizationId?: string;
  mockPublicationOutcome?: "success" | "publication_error";
};

function safeFailure(error: unknown): SafeFailure {
  if (error instanceof PublicationValidationError) {
    return {
      code: error.code,
      message: "La publication ou son compte social n’est plus valide.",
      retryable: false,
      remoteStateMayHaveChanged: false
    };
  }
  if (error instanceof PublicationMediaLoadError) {
    return {
      code: error.code,
      message: "Le média applicatif n’a pas pu être préparé.",
      retryable: error.retryable,
      remoteStateMayHaveChanged: false
    };
  }
  if (error instanceof PostizProviderError) {
    return {
      code: error.code,
      message: "Le provider de publication a refusé ou interrompu l’opération.",
      retryable: error.retryable,
      ...(error.statusCode === undefined ? {} : { statusCode: error.statusCode }),
      ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }),
      remoteStateMayHaveChanged:
        error.operation === "schedulePost" && error.remoteStateMayHaveChanged
    };
  }
  return {
    code: "PUBLICATION_PROCESSING_FAILED",
    message: "Le worker n’a pas pu terminer l’opération.",
    retryable: true,
    remoteStateMayHaveChanged: false
  };
}

function retryAt(now: Date, attemptNumber: number, requestedDelay?: number): Date {
  const exponential = Math.min(5_000 * 2 ** Math.max(0, attemptNumber - 1), MAX_RETRY_DELAY_MS);
  const delay = Math.min(Math.max(requestedDelay ?? exponential, exponential), MAX_RETRY_DELAY_MS);
  return new Date(now.getTime() + delay);
}

function fallbackRetryAt(now: Date): Date {
  return new Date(now.getTime() + DEFERRED_RETRY_MS);
}

function assertProviderTenant(
  payload: TenantJobPayload,
  provider: PostizProvider,
  options: PublicationProcessorOptions
): void {
  if (provider.mode === "real" && payload.organizationId !== options.realOrganizationId) {
    throw new PublicationProcessingError("POSTIZ_TENANT_MISMATCH", false);
  }
}

async function persistOutcome(
  repository: PublicationJobRepository,
  input: RecordPublicationOutcomeInput,
  persistenceRetryAt: Date
): Promise<void> {
  try {
    await repository.recordOutcome(input);
  } catch {
    throw new PublicationProcessingError(
      "PUBLICATION_OUTCOME_PERSIST_FAILED",
      true,
      persistenceRetryAt
    );
  }
}

function identifierFor(context: PublicationContext): PostizTargetIdentifier {
  const identifier = context.account.providerIdentifier;
  if (context.platform === "FACEBOOK") {
    if (identifier && identifier !== "facebook") {
      throw new PublicationValidationError("SOCIAL_ACCOUNT_IDENTIFIER_MISMATCH");
    }
    return "facebook";
  }
  if (identifier && identifier !== "instagram" && identifier !== "instagram-standalone") {
    throw new PublicationValidationError("SOCIAL_ACCOUNT_IDENTIFIER_MISMATCH");
  }
  return identifier === "instagram-standalone" ? identifier : "instagram";
}

function validateSharedContext(context: PublicationContext, provider: PostizProvider): void {
  if (context.account.status !== "CONNECTED" || !context.account.remoteIntegrationId) {
    throw new PublicationValidationError("SOCIAL_ACCOUNT_NOT_CONNECTED");
  }
  if (
    context.account.platform !== context.platform ||
    !context.post.platforms.includes(context.platform)
  ) {
    throw new PublicationValidationError("SOCIAL_ACCOUNT_PLATFORM_MISMATCH");
  }
  if (provider.mode === "real") {
    if (context.providerName !== "postiz" || context.account.provider !== "postiz") {
      throw new PublicationValidationError("POSTIZ_PROVIDER_MODE_MISMATCH");
    }
  } else if (!context.providerName.startsWith("postiz")) {
    throw new PublicationValidationError("POSTIZ_PROVIDER_MODE_MISMATCH");
  }
}

function validateScheduleContext(context: PublicationContext, provider: PostizProvider): void {
  validateSharedContext(context, provider);
  const version = context.post.currentVersion;
  if (
    !version ||
    version.versionNumber !== context.post.currentVersionNumber ||
    !context.post.approvedAt ||
    context.post.approvedAt.getTime() < version.createdAt.getTime()
  ) {
    throw new PublicationValidationError("APPROVED_VERSION_STALE");
  }
  if (
    context.post.status !== "SCHEDULED" &&
    context.post.status !== "APPROVED" &&
    context.post.status !== "PUBLISHING" &&
    context.post.status !== "FAILED"
  ) {
    throw new PublicationValidationError("POST_NOT_APPROVED");
  }
  if (context.post.format !== "IMAGE" && context.post.format !== "CAROUSEL") {
    throw new PublicationValidationError("POST_FORMAT_NOT_SUPPORTED");
  }
  const expectedCount = context.post.format === "IMAGE" ? 1 : 2;
  if (
    context.media.length < expectedCount ||
    (context.post.format === "IMAGE" && context.media.length !== 1) ||
    context.media.some((media) => !media.mimeType.startsWith("image/")) ||
    context.media.some((media) => media.status !== "APPROVED")
  ) {
    throw new PublicationValidationError("POST_MEDIA_INVALID");
  }
  if (context.media.some((media) => media.organizationId !== context.organizationId)) {
    throw new PublicationValidationError("POST_MEDIA_TENANT_MISMATCH");
  }
  if (
    context.establishments.some(
      (establishment) =>
        establishment.organizationId !== context.organizationId ||
        establishment.linkOrganizationId !== context.organizationId
    )
  ) {
    throw new PublicationValidationError("POST_ESTABLISHMENT_TENANT_MISMATCH");
  }
  if (
    context.establishments.some(
      (establishment) =>
        establishment.status !== "ACTIVE" || establishment.validationStatus !== "APPROVED"
    )
  ) {
    throw new PublicationValidationError("POST_ESTABLISHMENT_NOT_APPROVED");
  }
  if (
    context.establishments.some(
      (establishment) =>
        establishment.updatedAt.getTime() > context.post.approvedAt!.getTime() ||
        establishment.linkedAt.getTime() > context.post.approvedAt!.getTime()
    )
  ) {
    throw new PublicationValidationError("POST_ESTABLISHMENT_CHANGED_AFTER_APPROVAL");
  }
}

function contentFor(context: PublicationContext): string {
  const caption =
    context.platform === "INSTAGRAM" ? context.post.instagramCaption : context.post.facebookCaption;
  if (!caption?.trim()) throw new PublicationValidationError("POST_CAPTION_MISSING");
  const content = [
    caption.trim(),
    context.post.callToAction.trim(),
    context.post.hashtags.join(" ")
  ]
    .filter(Boolean)
    .join("\n\n");
  const maxLength = context.platform === "INSTAGRAM" ? 2_200 : 5_000;
  if (content.length > maxLength) throw new PublicationValidationError("POST_CAPTION_TOO_LONG");
  return content;
}

function safeSchedulePayload(context: PublicationContext, content: string): SafePublicationJson {
  return {
    operation: "schedule",
    publicationJobId: context.jobId,
    socialPostId: context.socialPostId,
    socialAccountId: context.socialAccountId,
    platform: context.platform,
    format: context.post.format,
    versionNumber: context.post.currentVersionNumber,
    scheduledAt: context.scheduledAt.toISOString(),
    contentLength: content.length,
    media: context.media.map((media) => ({
      mediaAssetId: media.id,
      mimeType: media.mimeType,
      byteSize: media.byteSize
    }))
  };
}

function safeScheduleResponse(
  outcome: "SCHEDULED" | "UNKNOWN_REMOTE_STATE",
  uploaded: readonly UploadedMedia[],
  externalId?: string,
  reason?: string
): SafePublicationJson {
  return {
    outcome,
    uploadedMedia: uploaded.map((media) => ({
      id: media.id,
      contentType: media.contentType,
      size: media.size
    })),
    externalId: externalId ?? null,
    reason: reason ?? null
  };
}

function safeReconcilePayload(context: PublicationContext): SafePublicationJson {
  return {
    operation: "reconcile",
    publicationJobId: context.jobId,
    socialPostId: context.socialPostId,
    socialAccountId: context.socialAccountId,
    platform: context.platform,
    externalId: context.externalId,
    scheduledAt: context.scheduledAt.toISOString()
  };
}

function safeRemoteResponse(input: {
  status: RemotePublicationStatus;
  certainty: string;
  evidence?: string;
  supportsAuthoritativeRemoteStatus: boolean;
  limitation?: string;
}): SafePublicationJson {
  return redactPostizSecrets({
    status: input.status,
    certainty: input.certainty,
    evidence: input.evidence ?? null,
    supportsAuthoritativeRemoteStatus: input.supportsAuthoritativeRemoteStatus,
    limitation: input.limitation ?? null
  }) as SafePublicationJson;
}

function reconciliationRunAt(scheduledAt: Date, now: Date): Date {
  return new Date(
    Math.max(
      scheduledAt.getTime() + RECONCILIATION_GRACE_MS,
      now.getTime() + RECONCILIATION_GRACE_MS
    )
  );
}

function reconciliationPayload(
  source: TenantJobPayload,
  jobId: string,
  runAt: Date
): TenantJobPayload {
  return {
    organizationId: source.organizationId,
    actorId: source.actorId,
    resourceId: jobId,
    idempotencyKey: `publication-reconcile-${jobId}-${runAt.getTime()}`
  };
}

function deterministicMockExternalId(idempotencyKey: string): string {
  const digest = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24);
  return `mock-post-${digest}`;
}

function durableMockRemoteStatus(
  context: PublicationContext,
  now: Date
): RemotePostStatusResult | undefined {
  if (
    context.remoteStatus !== MOCK_SCHEDULED_SUCCESS &&
    context.remoteStatus !== MOCK_SCHEDULED_FAILURE
  ) {
    return undefined;
  }
  const due = now.getTime() >= context.scheduledAt.getTime();
  const status: RemotePublicationStatus = !due
    ? "SCHEDULED"
    : context.remoteStatus === MOCK_SCHEDULED_FAILURE
      ? "FAILED"
      : "PUBLISHED";
  return {
    remotePostId: context.externalId ?? "mock-post-missing",
    status,
    certainty: "CONFIRMED",
    supportsAuthoritativeRemoteStatus: true,
    evidence: "MOCK_STATE"
  };
}

export type PublicationScheduleOutcome = {
  jobId: string;
  status: "SCHEDULED" | "UNCERTAIN" | "ALREADY_PROCESSED";
  externalId?: string;
};

export class PublicationScheduleProcessor {
  private readonly now: () => Date;

  constructor(
    private readonly repository: PublicationJobRepository,
    private readonly provider: PostizProvider,
    private readonly mediaLoader: PublicationMediaLoader,
    private readonly reconciliationPublisher: PublicationReconciliationPublisher,
    now: () => Date = () => new Date(),
    private readonly options: PublicationProcessorOptions = {}
  ) {
    this.now = now;
  }

  async execute(payload: TenantJobPayload): Promise<PublicationScheduleOutcome> {
    assertProviderTenant(payload, this.provider, this.options);
    const startedAt = this.now();
    let started: PublicationAttemptStartResult;
    try {
      started = await this.repository.startAttempt(payload, "schedule", startedAt);
    } catch {
      throw new PublicationProcessingError("PUBLICATION_CONTEXT_LOAD_FAILED", true);
    }
    if (started.kind === "MISSING") {
      throw new PublicationProcessingError("PUBLICATION_JOB_NOT_FOUND", false);
    }
    if (started.kind === "ALREADY_RUNNING") {
      throw new PublicationProcessingError(
        "PUBLICATION_ATTEMPT_ALREADY_RUNNING",
        true,
        fallbackRetryAt(startedAt)
      );
    }
    if (started.kind === "DEFERRED") {
      throw new PublicationProcessingError("PUBLICATION_ATTEMPT_DEFERRED", true, started.retryAt);
    }
    if (started.kind === "TERMINAL") {
      return { jobId: started.jobId, status: "ALREADY_PROCESSED" };
    }
    if (started.kind === "ALREADY_SCHEDULED") {
      const runAt = reconciliationRunAt(started.context.scheduledAt, startedAt);
      try {
        await this.reconciliationPublisher.publish(
          reconciliationPayload(payload, started.context.jobId, runAt),
          runAt
        );
      } catch {
        throw new PublicationProcessingError(
          "RECONCILIATION_ENQUEUE_FAILED",
          true,
          fallbackRetryAt(startedAt)
        );
      }
      return {
        jobId: started.context.jobId,
        status: "ALREADY_PROCESSED",
        ...(started.context.externalId ? { externalId: started.context.externalId } : {})
      };
    }

    const { context, attemptNumber } = started;
    let safePayload: SafePublicationJson = {
      operation: "schedule",
      publicationJobId: context.jobId
    };
    const uploaded: UploadedMedia[] = [];
    try {
      validateScheduleContext(context, this.provider);
      const identifier = identifierFor(context);
      const content = contentFor(context);
      safePayload = safeSchedulePayload(context, content);
      for (const media of context.media) {
        const loaded = await this.mediaLoader.load(media);
        uploaded.push(
          await this.provider.uploadMedia({
            file: loaded.file,
            fileName: loaded.fileName,
            contentType: loaded.contentType
          })
        );
      }
      const result = await this.provider.schedulePost({
        integrationId: context.account.remoteIntegrationId ?? "",
        identifier,
        content,
        format: context.post.format === "IMAGE" ? "image" : "carousel",
        media: uploaded.map(({ id, path, contentType }) => ({ id, path, contentType })),
        scheduledAt: context.scheduledAt
      });
      if (result.outcome === "UNKNOWN_REMOTE_STATE") {
        await persistOutcome(
          this.repository,
          {
            organizationId: context.organizationId,
            jobId: context.jobId,
            socialPostId: context.socialPostId,
            attemptNumber,
            attemptStatus: "UNCERTAIN",
            jobStatus: "UNCERTAIN",
            sanitizedPayload: safePayload,
            sanitizedResponse: safeScheduleResponse(
              "UNKNOWN_REMOTE_STATE",
              uploaded,
              undefined,
              result.reason
            ),
            remoteStatus: "UNKNOWN_REMOTE_STATE",
            uncertainSince: this.now(),
            errorCode: "UNKNOWN_REMOTE_STATE",
            errorMessage:
              "La création distante n’est pas confirmée. Une vérification humaine est requise.",
            postStatus: "FAILED"
          },
          fallbackRetryAt(this.now())
        );
        return { jobId: context.jobId, status: "UNCERTAIN" };
      }
      const remotePost = result.remotePosts[0];
      if (!remotePost || remotePost.integrationId !== context.account.remoteIntegrationId) {
        throw new PublicationValidationError("POSTIZ_SCHEDULE_RESPONSE_MISMATCH");
      }
      const externalId =
        this.provider.mode === "mock"
          ? deterministicMockExternalId(context.idempotencyKey)
          : remotePost.remotePostId;
      const persistedRemoteStatus =
        this.provider.mode === "mock"
          ? this.options.mockPublicationOutcome === "publication_error"
            ? MOCK_SCHEDULED_FAILURE
            : MOCK_SCHEDULED_SUCCESS
          : "SCHEDULED";
      await persistOutcome(
        this.repository,
        {
          organizationId: context.organizationId,
          jobId: context.jobId,
          socialPostId: context.socialPostId,
          attemptNumber,
          attemptStatus: "SUCCEEDED",
          jobStatus: "SCHEDULED",
          sanitizedPayload: safePayload,
          sanitizedResponse: safeScheduleResponse("SCHEDULED", uploaded, externalId),
          externalId,
          remoteStatus: persistedRemoteStatus,
          postStatus: "SCHEDULED"
        },
        fallbackRetryAt(this.now())
      );

      const runAt = reconciliationRunAt(context.scheduledAt, this.now());
      try {
        await this.reconciliationPublisher.publish(
          reconciliationPayload(payload, context.jobId, runAt),
          runAt
        );
      } catch {
        throw new PublicationProcessingError(
          "RECONCILIATION_ENQUEUE_FAILED",
          true,
          fallbackRetryAt(this.now())
        );
      }
      return {
        jobId: context.jobId,
        status: "SCHEDULED",
        externalId
      };
    } catch (error) {
      if (error instanceof PublicationProcessingError) throw error;
      const failure = safeFailure(error);
      const uncertain = failure.remoteStateMayHaveChanged;
      const nextAttemptAt = failure.retryable
        ? retryAt(this.now(), attemptNumber, failure.retryAfterMs)
        : undefined;
      await persistOutcome(
        this.repository,
        {
          organizationId: context.organizationId,
          jobId: context.jobId,
          socialPostId: context.socialPostId,
          attemptNumber,
          attemptStatus: uncertain ? "UNCERTAIN" : failure.retryable ? "RETRY_SCHEDULED" : "FAILED",
          jobStatus: uncertain ? "UNCERTAIN" : failure.retryable ? "PENDING" : "FAILED",
          sanitizedPayload: safePayload,
          sanitizedResponse: redactPostizSecrets({
            outcome: uncertain ? "UNKNOWN_REMOTE_STATE" : "ERROR",
            code: failure.code,
            httpStatus: failure.statusCode ?? null
          }) as SafePublicationJson,
          ...(nextAttemptAt ? { nextAttemptAt } : {}),
          ...(uncertain ? { uncertainSince: this.now() } : {}),
          errorCode: failure.code,
          errorMessage: failure.message,
          ...(failure.statusCode === undefined ? {} : { httpStatus: failure.statusCode }),
          postStatus: uncertain || !failure.retryable ? "FAILED" : "SCHEDULED"
        },
        fallbackRetryAt(this.now())
      );
      if (uncertain) return { jobId: context.jobId, status: "UNCERTAIN" };
      throw new PublicationProcessingError(failure.code, failure.retryable, nextAttemptAt);
    }
  }
}

export type PublicationReconciliationOutcome = {
  jobId: string;
  status:
    | "SCHEDULED"
    | "PUBLISHING"
    | "PUBLISHED"
    | "FAILED"
    | "CANCELLED"
    | "UNCERTAIN"
    | "ALREADY_PROCESSED";
};

export class PublicationReconciliationProcessor {
  private readonly now: () => Date;

  constructor(
    private readonly repository: PublicationJobRepository,
    private readonly provider: PostizProvider,
    private readonly publisher: PublicationReconciliationPublisher,
    now: () => Date = () => new Date(),
    private readonly options: PublicationProcessorOptions = {}
  ) {
    this.now = now;
  }

  async execute(payload: TenantJobPayload): Promise<PublicationReconciliationOutcome> {
    assertProviderTenant(payload, this.provider, this.options);
    const now = this.now();
    let started: PublicationAttemptStartResult;
    try {
      started = await this.repository.startAttempt(payload, "reconcile", now);
    } catch {
      throw new PublicationProcessingError("PUBLICATION_CONTEXT_LOAD_FAILED", true);
    }
    if (started.kind === "MISSING") {
      throw new PublicationProcessingError("PUBLICATION_JOB_NOT_FOUND", false);
    }
    if (started.kind === "ALREADY_RUNNING") {
      throw new PublicationProcessingError(
        "PUBLICATION_ATTEMPT_ALREADY_RUNNING",
        true,
        fallbackRetryAt(now)
      );
    }
    if (started.kind === "DEFERRED") {
      throw new PublicationProcessingError("PUBLICATION_ATTEMPT_DEFERRED", true, started.retryAt);
    }
    if (started.kind === "TERMINAL") {
      return { jobId: started.jobId, status: "ALREADY_PROCESSED" };
    }
    if (started.kind === "ALREADY_SCHEDULED") {
      throw new PublicationProcessingError("RECONCILIATION_STATE_INVALID", false);
    }

    const { context, attemptNumber } = started;
    const safePayload = safeReconcilePayload(context);
    try {
      validateSharedContext(context, this.provider);
      if (!context.externalId) throw new PublicationValidationError("REMOTE_POST_ID_MISSING");
      const startDate = new Date(context.scheduledAt.getTime() - 24 * 60 * 60_000);
      const endDate = new Date(
        Math.max(now.getTime(), context.scheduledAt.getTime()) + 24 * 60 * 60_000
      );
      const result =
        (this.provider.mode === "mock" ? durableMockRemoteStatus(context, now) : undefined) ??
        (await this.provider.getPostStatus({
          remotePostId: context.externalId,
          startDate,
          endDate
        }));
      const sanitizedResponse = safeRemoteResponse(result);

      if (result.status === "UNKNOWN_REMOTE_STATE" || result.status === "DRAFT") {
        await persistOutcome(
          this.repository,
          {
            organizationId: context.organizationId,
            jobId: context.jobId,
            socialPostId: context.socialPostId,
            attemptNumber,
            attemptStatus: "UNCERTAIN",
            jobStatus: "UNCERTAIN",
            sanitizedPayload: safePayload,
            sanitizedResponse,
            externalId: context.externalId,
            remoteStatus: result.status,
            uncertainSince: now,
            errorCode: "UNKNOWN_REMOTE_STATE",
            errorMessage: "Le statut distant ne peut pas être confirmé automatiquement.",
            postStatus: "FAILED",
            remoteStatusCheckedAt: now
          },
          fallbackRetryAt(this.now())
        );
        return { jobId: context.jobId, status: "UNCERTAIN" };
      }
      if (result.status === "PUBLISHED") {
        await persistOutcome(
          this.repository,
          {
            organizationId: context.organizationId,
            jobId: context.jobId,
            socialPostId: context.socialPostId,
            attemptNumber,
            attemptStatus: "SUCCEEDED",
            jobStatus: "PUBLISHED",
            sanitizedPayload: safePayload,
            sanitizedResponse,
            externalId: context.externalId,
            remoteStatus: "PUBLISHED",
            publishedAt: now,
            postStatus: "PUBLISHED",
            remoteStatusCheckedAt: now
          },
          fallbackRetryAt(this.now())
        );
        return { jobId: context.jobId, status: "PUBLISHED" };
      }
      if (result.status === "FAILED") {
        await persistOutcome(
          this.repository,
          {
            organizationId: context.organizationId,
            jobId: context.jobId,
            socialPostId: context.socialPostId,
            attemptNumber,
            attemptStatus: "FAILED",
            jobStatus: "FAILED",
            sanitizedPayload: safePayload,
            sanitizedResponse,
            externalId: context.externalId,
            remoteStatus: "FAILED",
            errorCode: "REMOTE_PUBLICATION_FAILED",
            errorMessage: "Postiz signale un échec de publication.",
            postStatus: "FAILED",
            remoteStatusCheckedAt: now
          },
          fallbackRetryAt(this.now())
        );
        return { jobId: context.jobId, status: "FAILED" };
      }
      if (result.status === "CANCELLED") {
        await persistOutcome(
          this.repository,
          {
            organizationId: context.organizationId,
            jobId: context.jobId,
            socialPostId: context.socialPostId,
            attemptNumber,
            attemptStatus: "CANCELLED",
            jobStatus: "CANCELLED",
            sanitizedPayload: safePayload,
            sanitizedResponse,
            externalId: context.externalId,
            remoteStatus: "CANCELLED",
            postStatus: "CANCELLED",
            remoteStatusCheckedAt: now
          },
          fallbackRetryAt(this.now())
        );
        return { jobId: context.jobId, status: "CANCELLED" };
      }

      const nextRunAt = new Date(now.getTime() + RECONCILIATION_POLL_MS);
      const publishing = result.status === "PUBLISHING";
      await persistOutcome(
        this.repository,
        {
          organizationId: context.organizationId,
          jobId: context.jobId,
          socialPostId: context.socialPostId,
          attemptNumber,
          attemptStatus: "SUCCEEDED",
          jobStatus: "SCHEDULED",
          sanitizedPayload: safePayload,
          sanitizedResponse,
          externalId: context.externalId,
          remoteStatus: result.status,
          nextAttemptAt: nextRunAt,
          postStatus: publishing ? "PUBLISHING" : "SCHEDULED",
          remoteStatusCheckedAt: now
        },
        fallbackRetryAt(this.now())
      );
      try {
        await this.publisher.publish(
          reconciliationPayload(payload, context.jobId, nextRunAt),
          nextRunAt
        );
      } catch {
        throw new PublicationProcessingError("RECONCILIATION_ENQUEUE_FAILED", true, nextRunAt);
      }
      return { jobId: context.jobId, status: publishing ? "PUBLISHING" : "SCHEDULED" };
    } catch (error) {
      if (error instanceof PublicationProcessingError) throw error;
      const failure = safeFailure(error);
      const uncertain = failure.remoteStateMayHaveChanged;
      const nextAttemptAt = failure.retryable
        ? retryAt(this.now(), attemptNumber, failure.retryAfterMs)
        : undefined;
      await persistOutcome(
        this.repository,
        {
          organizationId: context.organizationId,
          jobId: context.jobId,
          socialPostId: context.socialPostId,
          attemptNumber,
          attemptStatus: uncertain ? "UNCERTAIN" : failure.retryable ? "RETRY_SCHEDULED" : "FAILED",
          jobStatus: uncertain ? "UNCERTAIN" : failure.retryable ? "SCHEDULED" : "FAILED",
          sanitizedPayload: safePayload,
          sanitizedResponse: redactPostizSecrets({
            outcome: uncertain ? "UNKNOWN_REMOTE_STATE" : "ERROR",
            code: failure.code,
            httpStatus: failure.statusCode ?? null
          }) as SafePublicationJson,
          ...(context.externalId ? { externalId: context.externalId } : {}),
          ...(nextAttemptAt ? { nextAttemptAt } : {}),
          ...(uncertain ? { uncertainSince: this.now() } : {}),
          errorCode: failure.code,
          errorMessage: failure.message,
          ...(failure.statusCode === undefined ? {} : { httpStatus: failure.statusCode }),
          remoteStatusCheckedAt: this.now(),
          postStatus: uncertain || !failure.retryable ? "FAILED" : "SCHEDULED"
        },
        fallbackRetryAt(this.now())
      );
      if (uncertain) return { jobId: context.jobId, status: "UNCERTAIN" };
      throw new PublicationProcessingError(failure.code, failure.retryable, nextAttemptAt);
    }
  }
}
