import { db, type Prisma } from "@yokosocial/database";
import { mediaIngestJobPayloadSchema, type MediaIngestJobPayload } from "@yokosocial/shared";

import {
  MEDIA_DISPATCH_PENDING_MESSAGE,
  type JsonValue,
  type WebsiteImportPersistencePlan,
  type WebsiteImportRecord,
  type WebsiteImportScanRepository
} from "./website-import-scan.js";

function prismaJson(value: JsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function jsonObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export type PendingMediaCandidate =
  { kind: "COMPLETED" } | { kind: "INVALID" } | { kind: "PENDING"; payload: MediaIngestJobPayload };

export function pendingMediaPayload(input: {
  importId: string;
  organizationId: string;
  actorId: string;
  brandId: string;
  key: string;
  value: unknown;
}): PendingMediaCandidate {
  const value = jsonObject(input.value);
  if (!value || stringValue(value.kind) !== "MEDIA_CANDIDATE") return { kind: "INVALID" };
  const ingestionStatus = stringValue(value.ingestionStatus);
  if (ingestionStatus === "STORED" || ingestionStatus === "EXACT_DUPLICATE") {
    return { kind: "COMPLETED" };
  }

  const resourceId = stringValue(value.resourceId);
  const digest = resourceId ? /^media-([a-f0-9]{64})$/u.exec(resourceId)?.[1] : undefined;
  if (!resourceId || !digest || input.key !== `media:${resourceId}`) return { kind: "INVALID" };
  const idempotencyKey = `media-ingest-${input.importId}-${digest}`;
  const persistedIdempotencyKey = stringValue(value.idempotencyKey);
  if (persistedIdempotencyKey && persistedIdempotencyKey !== idempotencyKey) {
    return { kind: "INVALID" };
  }

  const parsed = mediaIngestJobPayloadSchema.safeParse({
    organizationId: input.organizationId,
    actorId: input.actorId,
    resourceId,
    idempotencyKey,
    websiteImportId: input.importId,
    brandId: input.brandId,
    sourceUrl: stringValue(value.sourceUrl),
    sourcePageUrl: stringValue(value.sourcePageUrl)
  });
  return parsed.success ? { kind: "PENDING", payload: parsed.data } : { kind: "INVALID" };
}

function appendDispatchMessage(current: string | null): string {
  if (current?.includes(MEDIA_DISPATCH_PENDING_MESSAGE)) return current;
  return current?.trim()
    ? `${current.trim()}\n${MEDIA_DISPATCH_PENDING_MESSAGE}`
    : MEDIA_DISPATCH_PENDING_MESSAGE;
}

function removeDispatchMessage(current: string | null): string | null {
  const cleaned = current?.replace(MEDIA_DISPATCH_PENDING_MESSAGE, "").trim();
  return cleaned || null;
}

export class PrismaWebsiteImportScanRepository implements WebsiteImportScanRepository {
  async findByTenant(input: {
    importId: string;
    organizationId: string;
  }): Promise<WebsiteImportRecord | null> {
    return db.websiteImport.findFirst({
      where: {
        id: input.importId,
        organizationId: input.organizationId,
        brand: { organizationId: input.organizationId }
      },
      select: {
        id: true,
        organizationId: true,
        brandId: true,
        websiteUrl: true,
        status: true,
        updatedAt: true,
        errorMessage: true
      }
    });
  }

  async claimForScan(input: {
    importId: string;
    organizationId: string;
    startedAt: Date;
    staleBefore: Date;
  }): Promise<boolean> {
    const result = await db.websiteImport.updateMany({
      where: {
        id: input.importId,
        organizationId: input.organizationId,
        brand: { organizationId: input.organizationId },
        OR: [
          { status: { in: ["PENDING", "FAILED"] } },
          {
            status: { in: ["CRAWLING", "ANALYZING"] },
            updatedAt: { lt: input.staleBefore }
          }
        ]
      },
      data: {
        status: "CRAWLING",
        startedAt: input.startedAt,
        completedAt: null,
        pagesDetected: 0,
        pagesScanned: 0,
        productsDetected: 0,
        categoriesDetected: 0,
        imagesDetected: 0,
        warningsCount: 0,
        errorsCount: 0,
        errorMessage: null
      }
    });
    return result.count === 1;
  }

  async updateProgress(input: {
    importId: string;
    organizationId: string;
    status: "CRAWLING" | "ANALYZING";
    pagesScanned?: number;
  }): Promise<void> {
    await db.websiteImport.updateMany({
      where: {
        id: input.importId,
        organizationId: input.organizationId,
        status: { in: ["CRAWLING", "ANALYZING"] }
      },
      data: {
        status: input.status,
        ...(input.pagesScanned !== undefined ? { pagesScanned: input.pagesScanned } : {})
      }
    });
  }

  async persistScan(plan: WebsiteImportPersistencePlan): Promise<void> {
    await db.$transaction(async (transaction) => {
      const activeImport = await transaction.websiteImport.findFirst({
        where: {
          id: plan.importRecord.id,
          organizationId: plan.importRecord.organizationId,
          brandId: plan.importRecord.brandId,
          brand: { organizationId: plan.importRecord.organizationId },
          status: { in: ["CRAWLING", "ANALYZING"] }
        },
        select: { id: true }
      });
      if (!activeImport) {
        throw new Error("L’import n’est plus disponible pour la persistance du résultat.");
      }

      const pageIds = new Map<string, string>();
      for (const page of plan.pages) {
        const persistedPage = await transaction.websiteImportPage.upsert({
          where: {
            websiteImportId_sourceUrl: {
              websiteImportId: plan.importRecord.id,
              sourceUrl: page.sourceUrl
            }
          },
          create: {
            organizationId: plan.importRecord.organizationId,
            websiteImportId: plan.importRecord.id,
            sourceUrl: page.sourceUrl,
            canonicalUrl: page.canonicalUrl,
            pageType: page.pageType,
            status: page.status,
            ...(page.httpStatus !== undefined ? { httpStatus: page.httpStatus } : {}),
            ...(page.fetchedAt ? { fetchedAt: page.fetchedAt } : {}),
            analyzedAt: page.analyzedAt,
            ...(page.sourceLastModifiedAt
              ? { sourceLastModifiedAt: page.sourceLastModifiedAt }
              : {}),
            ...(page.errorCode ? { errorCode: page.errorCode } : {}),
            ...(page.internalError ? { internalError: page.internalError } : {}),
            metadata: prismaJson(page.metadata)
          },
          update: {
            canonicalUrl: page.canonicalUrl,
            pageType: page.pageType,
            status: page.status,
            httpStatus: page.httpStatus ?? null,
            fetchedAt: page.fetchedAt ?? null,
            analyzedAt: page.analyzedAt,
            sourceLastModifiedAt: page.sourceLastModifiedAt ?? null,
            errorCode: page.errorCode ?? null,
            internalError: page.internalError ?? null,
            metadata: prismaJson(page.metadata)
          },
          select: { id: true }
        });
        pageIds.set(page.sourceUrl, persistedPage.id);
      }

      const establishmentIds = new Map<string, string>();
      for (const establishment of plan.establishments) {
        const existing = await transaction.establishment.findUnique({
          where: {
            brandId_slug: {
              brandId: plan.importRecord.brandId,
              slug: establishment.slug
            }
          },
          select: { id: true }
        });
        if (existing) {
          establishmentIds.set(establishment.sourceId, existing.id);
          continue;
        }
        const created = await transaction.establishment.create({
          data: {
            organizationId: plan.importRecord.organizationId,
            brandId: plan.importRecord.brandId,
            name: establishment.name,
            slug: establishment.slug,
            sourceUrl: establishment.sourceUrl,
            validationStatus: "UNREVIEWED",
            status: "NEEDS_REVIEW"
          },
          select: { id: true }
        });
        establishmentIds.set(establishment.sourceId, created.id);
      }

      const categoryIds = new Map<string, string>();
      for (const category of plan.categories) {
        const existing = await transaction.productCategory.findUnique({
          where: {
            brandId_slug: {
              brandId: plan.importRecord.brandId,
              slug: category.slug
            }
          },
          select: { id: true }
        });
        if (existing) {
          categoryIds.set(category.sourceId, existing.id);
          continue;
        }
        const created = await transaction.productCategory.create({
          data: {
            organizationId: plan.importRecord.organizationId,
            brandId: plan.importRecord.brandId,
            name: category.name,
            slug: category.slug,
            ...(category.description ? { description: category.description } : {}),
            sourceUrl: category.sourceUrl,
            validationStatus: "UNREVIEWED",
            sortOrder: category.sortOrder
          },
          select: { id: true }
        });
        categoryIds.set(category.sourceId, created.id);
      }

      for (const product of plan.products) {
        const existing = await transaction.menuItem.findUnique({
          where: {
            brandId_slug: {
              brandId: plan.importRecord.brandId,
              slug: product.slug
            }
          },
          select: { id: true }
        });
        if (existing) continue;
        const categoryId = categoryIds.get(product.categorySourceId);
        const sourcePageId = pageIds.get(product.sourceUrl);
        await transaction.menuItem.create({
          data: {
            organizationId: plan.importRecord.organizationId,
            brandId: plan.importRecord.brandId,
            ...(categoryId ? { categoryId } : {}),
            ...(sourcePageId ? { sourcePageId } : {}),
            name: product.name,
            slug: product.slug,
            ...(product.description ? { description: product.description } : {}),
            sourceUrl: product.sourceUrl,
            confidence: product.confidence,
            validationStatus: "UNREVIEWED",
            status: "NEEDS_REVIEW",
            ...(product.sourceLastModifiedAt
              ? { sourceLastModifiedAt: product.sourceLastModifiedAt }
              : {})
          }
        });
      }

      const previousData = await transaction.importedData.findMany({
        where: {
          organizationId: plan.importRecord.organizationId,
          websiteImportId: plan.importRecord.id
        },
        select: {
          key: true,
          fingerprint: true,
          validationStatus: true
        }
      });
      await transaction.importedData.deleteMany({
        where: {
          organizationId: plan.importRecord.organizationId,
          websiteImportId: plan.importRecord.id,
          validationStatus: "UNREVIEWED"
        }
      });

      const reviewedFingerprints = new Set(
        previousData
          .filter((row) => row.validationStatus !== "UNREVIEWED")
          .map((row) => row.fingerprint)
          .filter((value): value is string => Boolean(value))
      );
      const previousByKey = new Map<string, Set<string>>();
      for (const row of previousData) {
        if (!row.fingerprint) continue;
        const fingerprints = previousByKey.get(row.key) ?? new Set<string>();
        fingerprints.add(row.fingerprint);
        previousByKey.set(row.key, fingerprints);
      }

      const importedRows = plan.importedData.filter(
        (entry) => !reviewedFingerprints.has(entry.fingerprint)
      );
      if (importedRows.length > 0) {
        await transaction.importedData.createMany({
          data: importedRows.map((entry) => {
            const previousFingerprints = previousByKey.get(entry.key);
            const changed =
              previousFingerprints !== undefined && !previousFingerprints.has(entry.fingerprint);
            const establishmentId = entry.establishmentSourceId
              ? establishmentIds.get(entry.establishmentSourceId)
              : undefined;
            const websiteImportPageId = pageIds.get(entry.sourceUrl);
            return {
              organizationId: plan.importRecord.organizationId,
              brandId: plan.importRecord.brandId,
              ...(establishmentId ? { establishmentId } : {}),
              websiteImportId: plan.importRecord.id,
              ...(websiteImportPageId ? { websiteImportPageId } : {}),
              type: entry.type,
              key: entry.key,
              value: prismaJson(entry.value),
              ...(entry.normalizedValue ? { normalizedValue: entry.normalizedValue } : {}),
              sourceUrl: entry.sourceUrl,
              confidence: entry.confidence,
              validationStatus: "UNREVIEWED" as const,
              critical: entry.critical,
              retrievedAt: entry.retrievedAt,
              ...(entry.sourceLastModifiedAt
                ? { sourceLastModifiedAt: entry.sourceLastModifiedAt }
                : {}),
              ...(changed ? { lastChangeDetectedAt: plan.completedAt } : {}),
              fingerprint: entry.fingerprint
            };
          })
        });
      }

      const updated = await transaction.websiteImport.updateMany({
        where: {
          id: plan.importRecord.id,
          organizationId: plan.importRecord.organizationId,
          status: { in: ["CRAWLING", "ANALYZING"] }
        },
        data: {
          status: plan.finalStatus,
          startedAt: plan.startedAt,
          completedAt: plan.completedAt,
          pagesDetected: plan.statistics.pagesDetected,
          pagesScanned: plan.statistics.pagesScanned,
          productsDetected: plan.statistics.productsDetected,
          categoriesDetected: plan.statistics.categoriesDetected,
          imagesDetected: plan.statistics.imagesDetected,
          warningsCount: plan.statistics.warningsCount,
          errorsCount: plan.statistics.errorsCount,
          errorMessage: plan.errorMessage ?? null
        }
      });
      if (updated.count !== 1) {
        throw new Error("Le résultat d’import n’a pas pu être finalisé de manière atomique.");
      }
    });
  }

  async findPendingMediaJobs(input: {
    importId: string;
    organizationId: string;
    actorId: string;
  }): Promise<MediaIngestJobPayload[]> {
    const websiteImport = await db.websiteImport.findFirst({
      where: {
        id: input.importId,
        organizationId: input.organizationId,
        brand: { organizationId: input.organizationId },
        status: { in: ["WAITING_FOR_REVIEW", "PARTIALLY_COMPLETED"] }
      },
      select: {
        id: true,
        organizationId: true,
        brandId: true,
        importedData: {
          where: {
            organizationId: input.organizationId,
            type: "OTHER",
            key: { startsWith: "media:" },
            validationStatus: { in: ["UNREVIEWED", "APPROVED"] }
          },
          orderBy: { key: "asc" },
          select: { key: true, value: true }
        }
      }
    });
    if (!websiteImport)
      throw new Error("Import indisponible pour retrouver les médias en attente.");

    const pendingJobs: MediaIngestJobPayload[] = [];
    for (const candidate of websiteImport.importedData) {
      const parsed = pendingMediaPayload({
        importId: websiteImport.id,
        organizationId: websiteImport.organizationId,
        actorId: input.actorId,
        brandId: websiteImport.brandId,
        key: candidate.key,
        value: candidate.value
      });
      if (parsed.kind === "INVALID") {
        throw new Error("Un candidat média persistant est invalide.");
      }
      if (parsed.kind === "PENDING") pendingJobs.push(parsed.payload);
    }
    return pendingJobs;
  }

  async markMediaDispatchPending(input: {
    importId: string;
    organizationId: string;
  }): Promise<void> {
    await db.$transaction(async (transaction) => {
      const websiteImport = await transaction.websiteImport.findFirst({
        where: {
          id: input.importId,
          organizationId: input.organizationId,
          brand: { organizationId: input.organizationId },
          status: { in: ["WAITING_FOR_REVIEW", "PARTIALLY_COMPLETED"] }
        },
        select: { status: true, errorMessage: true }
      });
      if (!websiteImport) throw new Error("Import indisponible pour la reprise des médias.");

      const updated = await transaction.websiteImport.updateMany({
        where: {
          id: input.importId,
          organizationId: input.organizationId,
          status: websiteImport.status
        },
        data: {
          status: "PARTIALLY_COMPLETED",
          errorMessage: appendDispatchMessage(websiteImport.errorMessage)
        }
      });
      if (updated.count !== 1) throw new Error("État de reprise média modifié simultanément.");
    });
  }

  async markMediaDispatchReady(input: { importId: string; organizationId: string }): Promise<void> {
    await db.$transaction(async (transaction) => {
      const websiteImport = await transaction.websiteImport.findFirst({
        where: {
          id: input.importId,
          organizationId: input.organizationId,
          brand: { organizationId: input.organizationId }
        },
        select: { status: true, errorMessage: true }
      });
      if (websiteImport?.status === "WAITING_FOR_REVIEW") return;
      if (
        websiteImport?.status !== "PARTIALLY_COMPLETED" ||
        !websiteImport.errorMessage?.includes(MEDIA_DISPATCH_PENDING_MESSAGE)
      ) {
        throw new Error("Import indisponible pour finaliser la reprise des médias.");
      }

      const updated = await transaction.websiteImport.updateMany({
        where: {
          id: input.importId,
          organizationId: input.organizationId,
          status: "PARTIALLY_COMPLETED",
          errorMessage: websiteImport.errorMessage
        },
        data: {
          status: "WAITING_FOR_REVIEW",
          errorMessage: removeDispatchMessage(websiteImport.errorMessage)
        }
      });
      if (updated.count !== 1) {
        const ready = await transaction.websiteImport.count({
          where: {
            id: input.importId,
            organizationId: input.organizationId,
            status: "WAITING_FOR_REVIEW"
          }
        });
        if (ready !== 1) throw new Error("État de reprise média modifié simultanément.");
      }
    });
  }

  async markFailed(input: {
    importId: string;
    organizationId: string;
    completedAt: Date;
    errorMessage: string;
  }): Promise<void> {
    await db.websiteImport.updateMany({
      where: {
        id: input.importId,
        organizationId: input.organizationId,
        status: { in: ["CRAWLING", "ANALYZING"] }
      },
      data: {
        status: "FAILED",
        completedAt: input.completedAt,
        errorsCount: { increment: 1 },
        errorMessage: input.errorMessage
      }
    });
  }
}
