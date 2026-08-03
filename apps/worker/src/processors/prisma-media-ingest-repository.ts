import {
  classifyByContext,
  type HttpMediaIngestionResult,
  type MediaDuplicateRecord,
  type MediaIngestionRepository,
  type PersistMediaIngestionInput
} from "@yokosocial/media";
import { db, type Prisma } from "@yokosocial/database";
import type { MediaIngestJobPayload } from "@yokosocial/shared";

import type {
  MediaIngestJobContext,
  MediaIngestJobRepository,
  MediaJobJsonValue
} from "./media-ingest.js";

export type PrismaMediaIngestionOptions = {
  storageProvider: string;
  storageBucket?: string;
  perceptualCandidateLimit?: number;
};

function jsonObject(value: unknown): { [key: string]: MediaJobJsonValue } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as { [key: string]: MediaJobJsonValue };
}

function stringValue(value: MediaJobJsonValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function prismaJson(value: MediaJobJsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function parseHttpDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function editorialCategory(input: PersistMediaIngestionInput, context: MediaIngestJobContext) {
  if (context.categoryHint === "LOGO") return "LOGO";
  const withoutBrandName = (value: string | undefined): string | undefined => {
    const normalized = value?.replace(/yoko[-_ ]?sushi/gi, " ").trim();
    return normalized ? normalized : undefined;
  };
  const alt = withoutBrandName(context.alt);
  const title = withoutBrandName(context.title);
  const nearbyText = withoutBrandName(context.nearbyText);
  const classified = classifyByContext({
    filename: input.originalFilename,
    ...(alt ? { alt } : {}),
    ...(title ? { title } : {}),
    ...(nearbyText ? { nearbyText } : {})
  });
  const categories = {
    logo: "LOGO",
    plateaux: "PLATTER",
    california: "CALIFORNIA",
    sashimi: "SASHIMI",
    nigiri: "NIGIRI",
    maki: "MAKI",
    poke: "POKE",
    desserts: "DESSERT",
    boissons: "DRINK",
    livraison: "DELIVERY",
    restaurant: "RESTAURANT",
    équipe: "TEAM",
    promotions: "PROMOTION",
    "non classé": "UNCLASSIFIED"
  } as const;
  return categories[classified as keyof typeof categories] ?? "UNCLASSIFIED";
}

function mediaCategory(context: MediaIngestJobContext, editorial: string) {
  const fromHint = {
    LOGO: "LOGO",
    PRODUCT: "PRODUCT",
    RESTAURANT: "RESTAURANT",
    TECHNICAL: "TECHNICAL",
    UNCLASSIFIED: "UNCLASSIFIED"
  } as const;
  const hinted = context.categoryHint
    ? fromHint[context.categoryHint as keyof typeof fromHint]
    : undefined;
  if (hinted && hinted !== "UNCLASSIFIED") return hinted;
  const inferred = {
    LOGO: "LOGO",
    PLATTER: "PLATTER",
    RESTAURANT: "RESTAURANT",
    TEAM: "TEAM",
    DELIVERY: "DELIVERY",
    PROMOTION: "PROMOTION"
  } as const;
  return inferred[editorial as keyof typeof inferred] ?? "PRODUCT";
}

function duplicateRecord(row: {
  id: string;
  sha256: string | null;
  perceptualHash: string | null;
  storageKey: string;
}): MediaDuplicateRecord | undefined {
  if (!row.sha256) return undefined;
  return {
    id: row.id,
    sha256: row.sha256,
    ...(row.perceptualHash ? { perceptualHash: row.perceptualHash } : {}),
    storageKey: row.storageKey
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mediaPotentialScores(input: PersistMediaIngestionInput) {
  const { qualityScore, ratio, width, height } = input.inspection;
  const shortestSide = Math.min(width, height);
  const resolutionPenalty = shortestSide < 600 ? 25 : shortestSide < 1080 ? 8 : 0;
  const squareDistance = Math.abs(ratio - 1);
  const storyDistance = Math.abs(ratio - 9 / 16);
  const instagram = qualityScore - resolutionPenalty - (ratio < 0.8 || ratio > 1.91 ? 15 : 0);
  const facebook = qualityScore - resolutionPenalty - (ratio < 0.5 || ratio > 2.1 ? 12 : 0);
  const story = qualityScore - resolutionPenalty - Math.min(30, storyDistance * 35);
  const carousel = qualityScore - resolutionPenalty - Math.min(20, squareDistance * 18);
  const reel = story - 5;
  return {
    instagramPotentialScore: clampScore(instagram),
    facebookPotentialScore: clampScore(facebook),
    storyPotentialScore: clampScore(story),
    carouselPotentialScore: clampScore(carousel),
    reelPotentialScore: clampScore(reel)
  };
}

export function buildMediaAssetCreateData(
  context: MediaIngestJobContext,
  options: PrismaMediaIngestionOptions,
  input: PersistMediaIngestionInput
): Prisma.MediaAssetUncheckedCreateInput {
  const editorial = editorialCategory(input, context);
  const category = mediaCategory(context, editorial);
  const sourceLastModifiedAt = parseHttpDate(input.lastModified);
  // Inspection is advisory. Every website import remains unusable for publication until a human
  // explicitly approves it in the import review, even when the automated score is excellent.
  const status = "NEEDS_REVIEW" as const;
  const firstSimilar = input.similarDuplicates[0];
  const potentialScores = mediaPotentialScores(input);
  return {
    organizationId: context.organizationId,
    brandId: context.brandId,
    websiteImportId: context.websiteImportId,
    ...(context.websiteImportPageId ? { websiteImportPageId: context.websiteImportPageId } : {}),
    ...(firstSimilar ? { duplicateOfId: firstSimilar.id } : {}),
    sourceUrl: input.requestedSourceUrl,
    sourcePageUrl: context.sourcePageUrl,
    originalName: input.originalFilename,
    storageKey: input.storage.key,
    storageProvider: options.storageProvider,
    ...(options.storageBucket ? { storageBucket: options.storageBucket } : {}),
    ...(input.storage.publicUrl ? { publicUrl: input.storage.publicUrl } : {}),
    mimeType: input.inspection.mimeType,
    width: input.inspection.width,
    height: input.inspection.height,
    byteSize: BigInt(input.inspection.bytes),
    aspectRatio: input.inspection.ratio,
    sha256: input.sha256,
    perceptualHash: input.perceptualHash,
    ...(context.alt ? { altText: context.alt } : {}),
    ...(context.title ? { detectedTitle: context.title } : {}),
    ...(context.nearbyText ? { detectedDescription: context.nearbyText } : {}),
    category,
    editorialCategory: editorial,
    qualityScore: input.inspection.qualityScore,
    ...potentialScores,
    status,
    importedAt: input.downloadedAt,
    ...(sourceLastModifiedAt ? { sourceLastModifiedAt } : {}),
    metadata: prismaJson({
      requestedSourceUrl: input.requestedSourceUrl,
      finalSourceUrl: input.finalSourceUrl,
      declaredMimeType: input.declaredMimeType ?? null,
      etag: input.etag ?? null,
      sourceKind: context.sourceKind ?? null,
      automatedStatus: input.inspection.status,
      hasAlpha: input.inspection.hasAlpha,
      warnings: input.inspection.warnings,
      similarDuplicates: input.similarDuplicates.map((duplicate) => ({
        id: duplicate.id,
        distance: duplicate.distance
      }))
    })
  };
}

class ScopedPrismaMediaIngestionRepository implements MediaIngestionRepository {
  constructor(
    private readonly context: MediaIngestJobContext,
    private readonly options: PrismaMediaIngestionOptions
  ) {}

  async findExactDuplicates(input: {
    organizationId: string;
    sha256: string;
  }): Promise<readonly MediaDuplicateRecord[]> {
    this.assertOrganization(input.organizationId);
    const rows = await db.mediaAsset.findMany({
      where: {
        organizationId: input.organizationId,
        sha256: input.sha256
      },
      select: { id: true, sha256: true, perceptualHash: true, storageKey: true }
    });
    return rows.map(duplicateRecord).filter((row): row is MediaDuplicateRecord => Boolean(row));
  }

  async findPerceptualCandidates(input: {
    organizationId: string;
    perceptualHash: string;
    maxDistance: number;
  }): Promise<readonly MediaDuplicateRecord[]> {
    this.assertOrganization(input.organizationId);
    const limit = Math.min(Math.max(this.options.perceptualCandidateLimit ?? 2_000, 1), 10_000);
    const rows = await db.mediaAsset.findMany({
      where: {
        organizationId: input.organizationId,
        perceptualHash: { not: null }
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, sha256: true, perceptualHash: true, storageKey: true }
    });
    return rows.map(duplicateRecord).filter((row): row is MediaDuplicateRecord => Boolean(row));
  }

  async create(input: PersistMediaIngestionInput): Promise<{ id: string }> {
    this.assertOrganization(input.organizationId);
    if (
      input.requestedSourceUrl !== this.context.sourceUrl ||
      input.sourcePageUrl !== this.context.sourcePageUrl
    ) {
      throw new Error("La provenance du média ne correspond pas au job autorisé.");
    }
    const createData = buildMediaAssetCreateData(this.context, this.options, input);

    try {
      return await db.$transaction(async (transaction) => {
        const created = await transaction.mediaAsset.create({
          data: createData,
          select: { id: true }
        });
        const nextCandidateValue = {
          ...this.context.candidateValue,
          ingestionStatus: "STORED",
          downloadStatus: "COMPLETED",
          mediaAssetId: created.id,
          sha256: input.sha256,
          perceptualHash: input.perceptualHash,
          qualityScore: input.inspection.qualityScore,
          requiresReview: createData.status !== "APPROVED",
          similarDuplicateIds: input.similarDuplicates.map(({ id }) => id),
          completedAt: input.downloadedAt.toISOString()
        } satisfies { [key: string]: MediaJobJsonValue };
        const candidateUpdated = await transaction.importedData.updateMany({
          where: {
            id: this.context.candidateId,
            organizationId: this.context.organizationId,
            brandId: this.context.brandId,
            websiteImportId: this.context.websiteImportId,
            updatedAt: this.context.candidateUpdatedAt
          },
          data: {
            value: prismaJson(nextCandidateValue),
            updatedAt: input.downloadedAt
          }
        });
        if (candidateUpdated.count !== 1) {
          throw new Error("Le candidat média a déjà été traité ou modifié.");
        }
        const importUpdated = await transaction.websiteImport.updateMany({
          where: {
            id: this.context.websiteImportId,
            organizationId: this.context.organizationId,
            brandId: this.context.brandId
          },
          data: {
            imagesImported: { increment: 1 },
            ...(input.similarDuplicates.length > 0 ? { duplicatesDetected: { increment: 1 } } : {})
          }
        });
        if (importUpdated.count !== 1) {
          throw new Error("L’import média n’est plus disponible.");
        }
        return created;
      });
    } catch (error) {
      const concurrent = await db.mediaAsset.findFirst({
        where: {
          organizationId: input.organizationId,
          sha256: input.sha256
        },
        select: { id: true }
      });
      if (concurrent) {
        throw new Error("Un média identique vient d’être importé par un autre job.");
      }
      throw error;
    }
  }

  private assertOrganization(organizationId: string): void {
    if (organizationId !== this.context.organizationId) {
      throw new Error("Accès média inter-organisation refusé.");
    }
  }
}

export class PrismaMediaIngestJobRepository implements MediaIngestJobRepository {
  constructor(private readonly options: PrismaMediaIngestionOptions) {}

  createIngestionRepository(context: MediaIngestJobContext): MediaIngestionRepository {
    return new ScopedPrismaMediaIngestionRepository(context, this.options);
  }

  async loadContext(payload: MediaIngestJobPayload): Promise<MediaIngestJobContext | null> {
    const websiteImport = await db.websiteImport.findFirst({
      where: {
        id: payload.websiteImportId,
        organizationId: payload.organizationId,
        brandId: payload.brandId,
        brand: { organizationId: payload.organizationId },
        status: { in: ["WAITING_FOR_REVIEW", "IMPORTING", "COMPLETED", "PARTIALLY_COMPLETED"] }
      },
      select: {
        id: true,
        organizationId: true,
        brandId: true,
        pages: {
          where: {
            organizationId: payload.organizationId,
            sourceUrl: payload.sourcePageUrl
          },
          take: 1,
          select: { id: true }
        },
        importedData: {
          where: {
            organizationId: payload.organizationId,
            brandId: payload.brandId,
            type: "OTHER",
            key: `media:${payload.resourceId}`,
            validationStatus: { in: ["UNREVIEWED", "APPROVED"] }
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, value: true, updatedAt: true }
        }
      }
    });
    const candidate = websiteImport?.importedData[0];
    const value = jsonObject(candidate?.value);
    if (!websiteImport || !candidate || !value) return null;
    if (
      stringValue(value.kind) !== "MEDIA_CANDIDATE" ||
      stringValue(value.resourceId) !== payload.resourceId ||
      stringValue(value.sourceUrl) !== payload.sourceUrl ||
      stringValue(value.sourcePageUrl) !== payload.sourcePageUrl
    ) {
      return null;
    }
    const rawStatus = stringValue(value.ingestionStatus);
    const ingestionStatus =
      rawStatus === "STORED" || rawStatus === "EXACT_DUPLICATE" || rawStatus === "FAILED"
        ? rawStatus
        : undefined;
    const sourceKind = stringValue(value.sourceKind);
    const categoryHint = stringValue(value.categoryHint);
    const alt = stringValue(value.alt);
    const title = stringValue(value.title);
    const nearbyText = stringValue(value.context);
    const persistedMediaId = stringValue(value.mediaAssetId);

    return {
      organizationId: websiteImport.organizationId,
      brandId: websiteImport.brandId,
      websiteImportId: websiteImport.id,
      ...(websiteImport.pages[0]?.id ? { websiteImportPageId: websiteImport.pages[0].id } : {}),
      candidateId: candidate.id,
      candidateUpdatedAt: candidate.updatedAt,
      candidateValue: value,
      sourceUrl: payload.sourceUrl,
      sourcePageUrl: payload.sourcePageUrl,
      ...(sourceKind ? { sourceKind } : {}),
      ...(categoryHint ? { categoryHint } : {}),
      ...(alt ? { alt } : {}),
      ...(title ? { title } : {}),
      ...(nearbyText ? { nearbyText } : {}),
      ...(ingestionStatus ? { ingestionStatus } : {}),
      ...(persistedMediaId ? { persistedMediaId } : {})
    };
  }

  async recordOutcome(input: {
    context: MediaIngestJobContext;
    result: HttpMediaIngestionResult;
    completedAt: Date;
  }): Promise<boolean> {
    const resultValue: { [key: string]: MediaJobJsonValue } =
      input.result.outcome === "STORED"
        ? {
            ingestionStatus: "STORED",
            downloadStatus: "COMPLETED",
            mediaAssetId: input.result.mediaId,
            sha256: input.result.sha256,
            perceptualHash: input.result.perceptualHash,
            qualityScore: input.result.inspection.qualityScore,
            requiresReview: input.result.requiresReview,
            similarDuplicateIds: input.result.similarDuplicates.map(({ id }) => id),
            completedAt: input.completedAt.toISOString()
          }
        : {
            ingestionStatus: "EXACT_DUPLICATE",
            downloadStatus: "COMPLETED",
            sha256: input.result.sha256,
            perceptualHash: input.result.perceptualHash,
            exactDuplicateIds: input.result.exactDuplicates.map(({ id }) => id),
            completedAt: input.completedAt.toISOString()
          };
    const nextValue = { ...input.context.candidateValue, ...resultValue };

    return db.$transaction(async (transaction) => {
      const updated = await transaction.importedData.updateMany({
        where: {
          id: input.context.candidateId,
          organizationId: input.context.organizationId,
          brandId: input.context.brandId,
          websiteImportId: input.context.websiteImportId,
          updatedAt: input.context.candidateUpdatedAt
        },
        data: { value: prismaJson(nextValue) }
      });
      if (updated.count !== 1) {
        const current = await transaction.importedData.findFirst({
          where: {
            id: input.context.candidateId,
            organizationId: input.context.organizationId,
            brandId: input.context.brandId,
            websiteImportId: input.context.websiteImportId
          },
          select: { value: true }
        });
        const currentValue = jsonObject(current?.value);
        return input.result.outcome === "STORED"
          ? stringValue(currentValue?.ingestionStatus) === "STORED" &&
              stringValue(currentValue?.mediaAssetId) === input.result.mediaId
          : stringValue(currentValue?.ingestionStatus) === "EXACT_DUPLICATE";
      }

      const hasDuplicate =
        input.result.outcome === "EXACT_DUPLICATE" || input.result.similarDuplicates.length > 0;
      await transaction.websiteImport.updateMany({
        where: {
          id: input.context.websiteImportId,
          organizationId: input.context.organizationId,
          brandId: input.context.brandId
        },
        data: {
          ...(input.result.outcome === "STORED" ? { imagesImported: { increment: 1 } } : {}),
          ...(hasDuplicate ? { duplicatesDetected: { increment: 1 } } : {})
        }
      });
      return true;
    });
  }

  async recordFailure(input: {
    context: MediaIngestJobContext;
    errorCode: string;
    failedAt: Date;
  }): Promise<void> {
    const nextValue = {
      ...input.context.candidateValue,
      ingestionStatus: "FAILED",
      downloadStatus: "FAILED",
      ingestionErrorCode: input.errorCode,
      lastAttemptAt: input.failedAt.toISOString()
    } satisfies { [key: string]: MediaJobJsonValue };

    await db.$transaction(async (transaction) => {
      const updated = await transaction.importedData.updateMany({
        where: {
          id: input.context.candidateId,
          organizationId: input.context.organizationId,
          brandId: input.context.brandId,
          websiteImportId: input.context.websiteImportId,
          updatedAt: input.context.candidateUpdatedAt
        },
        data: { value: prismaJson(nextValue) }
      });
      if (updated.count !== 1 || input.context.ingestionStatus === "FAILED") return;
      await transaction.websiteImport.updateMany({
        where: {
          id: input.context.websiteImportId,
          organizationId: input.context.organizationId,
          brandId: input.context.brandId
        },
        data: { errorsCount: { increment: 1 } }
      });
    });
  }
}
