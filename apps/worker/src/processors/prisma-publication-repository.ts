import { db, type Prisma } from "@yokosocial/database";
import type { TenantJobPayload } from "@yokosocial/shared";

import type {
  PublicationAttemptStartResult,
  PublicationContext,
  PublicationJobRepository,
  PublicationPhase,
  RecordPublicationOutcomeInput,
  SafePublicationJson,
  StoredPublicationJobStatus
} from "./publication.js";

const publicationJobInclude = {
  socialAccount: {
    select: {
      id: true,
      status: true,
      provider: true,
      platform: true,
      remoteIntegrationId: true,
      metadata: true
    }
  },
  socialPost: {
    select: {
      id: true,
      status: true,
      format: true,
      platforms: true,
      instagramCaption: true,
      facebookCaption: true,
      callToAction: true,
      hashtags: true,
      currentVersionNumber: true,
      approvedAt: true,
      establishmentLinks: {
        select: {
          organizationId: true,
          createdAt: true,
          establishment: {
            select: {
              id: true,
              organizationId: true,
              status: true,
              validationStatus: true,
              updatedAt: true
            }
          }
        }
      },
      versions: {
        orderBy: { versionNumber: "desc" as const },
        take: 1,
        select: { id: true, versionNumber: true, createdAt: true }
      },
      media: {
        orderBy: { sortOrder: "asc" as const },
        select: {
          mediaAsset: {
            select: {
              id: true,
              organizationId: true,
              originalName: true,
              storageProvider: true,
              storageKey: true,
              publicUrl: true,
              mimeType: true,
              byteSize: true,
              status: true
            }
          },
          mediaVariant: {
            select: {
              storageKey: true,
              publicUrl: true,
              mimeType: true,
              byteSize: true
            }
          }
        }
      }
    }
  }
} satisfies Prisma.PublicationJobInclude;

type PublicationJobRow = Prisma.PublicationJobGetPayload<{
  include: typeof publicationJobInclude;
}>;

function safeByteSize(value: bigint | null): number | null {
  if (value === null || value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n) return null;
  return Number(value);
}

function providerIdentifier(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = Reflect.get(metadata, "identifier") as unknown;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contextFromRow(row: PublicationJobRow): PublicationContext {
  const version = row.socialPost.versions[0] ?? null;
  return {
    jobId: row.id,
    organizationId: row.organizationId,
    socialPostId: row.socialPostId,
    socialAccountId: row.socialAccountId,
    jobStatus: row.status,
    providerName: row.provider,
    platform: row.platform,
    scheduledAt: row.scheduledAt,
    externalId: row.externalId,
    remoteStatus: row.remoteStatus,
    attemptsCount: row.attemptsCount,
    idempotencyKey: row.idempotencyKey,
    post: {
      status: row.socialPost.status,
      format: row.socialPost.format,
      platforms: row.socialPost.platforms,
      instagramCaption: row.socialPost.instagramCaption,
      facebookCaption: row.socialPost.facebookCaption,
      callToAction: row.socialPost.callToAction,
      hashtags: row.socialPost.hashtags,
      currentVersionNumber: row.socialPost.currentVersionNumber,
      approvedAt: row.socialPost.approvedAt,
      currentVersion: version
        ? {
            id: version.id,
            versionNumber: version.versionNumber,
            createdAt: version.createdAt
          }
        : null
    },
    account: {
      status: row.socialAccount.status,
      provider: row.socialAccount.provider,
      platform: row.socialAccount.platform,
      remoteIntegrationId: row.socialAccount.remoteIntegrationId,
      providerIdentifier: providerIdentifier(row.socialAccount.metadata)
    },
    establishments: row.socialPost.establishmentLinks.map(
      ({ organizationId, createdAt, establishment }) => ({
        id: establishment.id,
        organizationId: establishment.organizationId,
        linkOrganizationId: organizationId,
        status: establishment.status,
        validationStatus: establishment.validationStatus,
        updatedAt: establishment.updatedAt,
        linkedAt: createdAt
      })
    ),
    media: row.socialPost.media.map(({ mediaAsset, mediaVariant }) => ({
      id: mediaAsset.id,
      organizationId: mediaAsset.organizationId,
      originalName: mediaAsset.originalName,
      storageProvider: mediaAsset.storageProvider,
      storageKey: mediaVariant?.storageKey ?? mediaAsset.storageKey,
      publicUrl: mediaVariant?.publicUrl ?? mediaAsset.publicUrl,
      mimeType: mediaVariant?.mimeType ?? mediaAsset.mimeType,
      byteSize: safeByteSize(mediaVariant?.byteSize ?? mediaAsset.byteSize),
      status: mediaAsset.status
    }))
  };
}

function prismaJson(value: SafePublicationJson): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const terminalStatuses = new Set<StoredPublicationJobStatus>([
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
  "UNCERTAIN"
]);
const PROCESSING_LEASE_MS = 30_000;

export type PublicationAttemptTimingDecision =
  { kind: "READY" } | { kind: "DEFERRED"; retryAt: Date } | { kind: "LEASE_EXPIRED" };

export function publicationAttemptTiming(input: {
  status: StoredPublicationJobStatus;
  expectedStatus: "PENDING" | "SCHEDULED";
  updatedAt: Date;
  nextAttemptAt: Date | null;
  startedAt: Date;
}): PublicationAttemptTimingDecision {
  if (input.status === "PROCESSING") {
    const leaseExpiresAt = new Date(input.updatedAt.getTime() + PROCESSING_LEASE_MS);
    return leaseExpiresAt.getTime() > input.startedAt.getTime()
      ? { kind: "DEFERRED", retryAt: leaseExpiresAt }
      : { kind: "LEASE_EXPIRED" };
  }
  if (
    input.status === input.expectedStatus &&
    input.nextAttemptAt &&
    input.nextAttemptAt.getTime() > input.startedAt.getTime()
  ) {
    return { kind: "DEFERRED", retryAt: input.nextAttemptAt };
  }
  return { kind: "READY" };
}

export class PrismaPublicationJobRepository implements PublicationJobRepository {
  async startAttempt(
    payload: TenantJobPayload,
    phase: PublicationPhase,
    startedAt: Date
  ): Promise<PublicationAttemptStartResult> {
    return db.$transaction(async (transaction) => {
      const row = await transaction.publicationJob.findFirst({
        where: {
          id: payload.resourceId,
          organizationId: payload.organizationId,
          socialPost: { organizationId: payload.organizationId },
          socialAccount: { organizationId: payload.organizationId }
        },
        include: publicationJobInclude
      });
      if (!row) return { kind: "MISSING" as const };

      const context = contextFromRow(row);
      if (phase === "schedule" && row.status === "SCHEDULED" && row.externalId) {
        return { kind: "ALREADY_SCHEDULED" as const, context };
      }
      if (terminalStatuses.has(row.status)) {
        return { kind: "TERMINAL" as const, jobId: row.id, status: row.status };
      }
      const expectedStatus = phase === "schedule" ? "PENDING" : "SCHEDULED";
      const timing = publicationAttemptTiming({
        status: row.status,
        expectedStatus,
        updatedAt: row.updatedAt,
        nextAttemptAt: row.nextAttemptAt,
        startedAt
      });
      if (timing.kind === "DEFERRED") {
        return { kind: "DEFERRED" as const, jobId: row.id, retryAt: timing.retryAt };
      }
      if (row.status === "PROCESSING") {
        if (timing.kind === "LEASE_EXPIRED") {
          const safeLeaseResponse = {
            outcome: "UNKNOWN_REMOTE_STATE",
            code: "PROCESSING_LEASE_EXPIRED"
          } satisfies SafePublicationJson;
          const frozen = await transaction.publicationJob.updateMany({
            where: {
              id: row.id,
              organizationId: payload.organizationId,
              status: "PROCESSING",
              updatedAt: row.updatedAt
            },
            data: {
              status: "UNCERTAIN",
              remoteStatus: "UNKNOWN_REMOTE_STATE",
              uncertainSince: startedAt,
              nextAttemptAt: null,
              lastErrorCode: "PROCESSING_LEASE_EXPIRED",
              lastErrorMessage:
                "Le worker a été interrompu; vérifier Postiz avant toute nouvelle tentative."
            }
          });
          if (frozen.count === 1) {
            await transaction.publicationAttempt.updateMany({
              where: {
                organizationId: payload.organizationId,
                publicationJobId: row.id,
                status: "STARTED"
              },
              data: {
                status: "UNCERTAIN",
                errorCode: "PROCESSING_LEASE_EXPIRED",
                errorMessage:
                  "Le worker a été interrompu pendant une opération distante potentielle.",
                sanitizedResponse: prismaJson(safeLeaseResponse)
              }
            });
            await transaction.socialPost.updateMany({
              where: { id: row.socialPostId, organizationId: payload.organizationId },
              data: { status: "FAILED" }
            });
            return { kind: "TERMINAL" as const, jobId: row.id, status: "UNCERTAIN" as const };
          }
        }
        return {
          kind: "DEFERRED" as const,
          jobId: row.id,
          retryAt: new Date(startedAt.getTime() + 5_000)
        };
      }

      if (row.status !== expectedStatus) {
        return { kind: "TERMINAL" as const, jobId: row.id, status: row.status };
      }
      if (phase === "reconcile" && !row.externalId) {
        return { kind: "TERMINAL" as const, jobId: row.id, status: row.status };
      }

      const attemptNumber = row.attemptsCount + 1;
      const claimed = await transaction.publicationJob.updateMany({
        where: {
          id: row.id,
          organizationId: payload.organizationId,
          status: expectedStatus,
          attemptsCount: row.attemptsCount
        },
        data: {
          status: "PROCESSING",
          attemptsCount: { increment: 1 },
          nextAttemptAt: null
        }
      });
      if (claimed.count !== 1) {
        return {
          kind: "DEFERRED" as const,
          jobId: row.id,
          retryAt: new Date(startedAt.getTime() + 5_000)
        };
      }
      await transaction.publicationAttempt.create({
        data: {
          organizationId: payload.organizationId,
          publicationJobId: row.id,
          provider: row.provider,
          platform: row.platform,
          attemptNumber,
          attemptedAt: startedAt,
          status: "STARTED",
          sanitizedPayload: {
            operation: phase,
            publicationJobId: row.id,
            socialPostId: row.socialPostId,
            socialAccountId: row.socialAccountId
          }
        }
      });

      return {
        kind: "STARTED" as const,
        attemptNumber,
        context: {
          ...context,
          jobStatus: "PROCESSING" as const,
          attemptsCount: attemptNumber
        }
      };
    });
  }

  async recordOutcome(input: RecordPublicationOutcomeInput): Promise<void> {
    await db.$transaction(async (transaction) => {
      const attemptUpdated = await transaction.publicationAttempt.updateMany({
        where: {
          organizationId: input.organizationId,
          publicationJobId: input.jobId,
          attemptNumber: input.attemptNumber,
          status: "STARTED"
        },
        data: {
          status: input.attemptStatus,
          sanitizedPayload: prismaJson(input.sanitizedPayload),
          ...(input.sanitizedResponse === undefined
            ? {}
            : { sanitizedResponse: prismaJson(input.sanitizedResponse) }),
          ...(input.httpStatus === undefined ? {} : { httpStatus: input.httpStatus }),
          ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
          ...(input.errorMessage === undefined ? {} : { errorMessage: input.errorMessage }),
          ...(input.nextAttemptAt === undefined ? {} : { nextAttemptAt: input.nextAttemptAt }),
          ...(input.externalId === undefined ? {} : { externalId: input.externalId }),
          ...(input.remoteStatusCheckedAt === undefined
            ? {}
            : { remoteStatusCheckedAt: input.remoteStatusCheckedAt })
        }
      });
      if (attemptUpdated.count !== 1) {
        throw new Error("La tentative de publication n’est plus active.");
      }

      const jobUpdated = await transaction.publicationJob.updateMany({
        where: {
          id: input.jobId,
          organizationId: input.organizationId,
          socialPostId: input.socialPostId,
          status: "PROCESSING"
        },
        data: {
          status: input.jobStatus,
          sanitizedPayload: prismaJson(input.sanitizedPayload),
          nextAttemptAt: input.nextAttemptAt ?? null,
          uncertainSince: input.uncertainSince ?? null,
          ...(input.externalId === undefined ? {} : { externalId: input.externalId }),
          ...(input.remoteStatus === undefined ? {} : { remoteStatus: input.remoteStatus }),
          ...(input.publishedAt === undefined ? {} : { publishedAt: input.publishedAt }),
          lastErrorCode: input.errorCode ?? null,
          lastErrorMessage: input.errorMessage ?? null
        }
      });
      if (jobUpdated.count !== 1) {
        throw new Error("Le job de publication n’est plus en cours de traitement.");
      }

      if (!input.postStatus) return;
      let postStatus = input.postStatus;
      if (
        input.postStatus === "SCHEDULED" ||
        input.postStatus === "PUBLISHING" ||
        input.postStatus === "PUBLISHED"
      ) {
        const siblingJobs = await transaction.publicationJob.findMany({
          where: { organizationId: input.organizationId, socialPostId: input.socialPostId },
          select: { status: true, remoteStatus: true }
        });
        if (siblingJobs.some((job) => job.status === "FAILED" || job.status === "UNCERTAIN")) {
          postStatus = "FAILED";
        } else if (siblingJobs.every((job) => job.status === "PUBLISHED")) {
          postStatus = "PUBLISHED";
        } else if (
          siblingJobs.some((job) => job.status === "PUBLISHED" || job.remoteStatus === "PUBLISHING")
        ) {
          postStatus = "PUBLISHING";
        }
      }
      await transaction.socialPost.updateMany({
        where: { id: input.socialPostId, organizationId: input.organizationId },
        data: { status: postStatus }
      });
    });
  }
}
