import { createHash } from "node:crypto";

import { db, type Prisma } from "@yokosocial/database";
import { NextResponse } from "next/server";

import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import { requireOrganization, requireTrustedMutationOrigin } from "@/lib/authorization";
import {
  INGESTED_MEDIA_REVIEW_STATUSES,
  importReviewSchema,
  mediaDecisionCoverage,
  resolveMediaCandidateIngestion
} from "@/lib/import-review-contract";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024 * 1024;

type JsonObject = Record<string, unknown>;

function objectValue(value: Prisma.JsonValue): JsonObject | undefined {
  return value !== null && !Array.isArray(value) && typeof value === "object" ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stableSourceSlug(prefix: string, sourceId: string): string {
  const normalized = sourceId
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const fallback = createHash("sha256").update(sourceId).digest("hex").slice(0, 16);
  return `${prefix}-${normalized || fallback}`;
}

function sourceId(row: { key: string; value: Prisma.JsonValue }): string | undefined {
  const fromValue = stringValue(objectValue(row.value)?.sourceId);
  if (fromValue) return fromValue;
  const segments = row.key.split(":");
  return segments.length >= 2 ? stringValue(segments[1]) : undefined;
}

async function readInput(request: Request) {
  try {
    return importReviewSchema.safeParse(await readJsonWithLimit(request, MAX_BODY_BYTES));
  } catch {
    return null;
  }
}

export async function POST(request: Request, context: { params: Promise<{ importId: string }> }) {
  try {
    requireTrustedMutationOrigin(request);
    const parsed = await readInput(request);
    if (!parsed?.success) {
      return NextResponse.json({ error: "Décisions de validation invalides." }, { status: 400 });
    }

    const authorization = await requireOrganization(
      parsed.data.organizationId,
      ["OWNER", "ADMIN", "EDITOR", "REVIEWER"],
      request.headers
    );
    const { importId } = await context.params;
    const reviewedAt = new Date();
    const result = await db.$transaction(async (transaction) => {
      const websiteImport = await transaction.websiteImport.findFirst({
        where: { id: importId, organizationId: authorization.organizationId },
        select: {
          id: true,
          brandId: true,
          status: true,
          completedAt: true,
          errorsCount: true
        }
      });
      if (!websiteImport) return null;
      if (!["WAITING_FOR_REVIEW", "PARTIALLY_COMPLETED"].includes(websiteImport.status)) {
        return { kind: "CONFLICT" as const, status: websiteImport.status };
      }

      const dataDecisionById = new Map(
        parsed.data.dataDecisions.map((decision) => [decision.id, decision.decision])
      );
      const mediaDecisionById = new Map(
        parsed.data.mediaDecisions.map((decision) => [decision.id, decision.decision])
      );
      const [importedRows, mediaCandidates, expectedMediaRows] = await Promise.all([
        transaction.importedData.findMany({
          where: {
            organizationId: authorization.organizationId,
            websiteImportId: websiteImport.id,
            validationStatus: "UNREVIEWED",
            NOT: { key: { startsWith: "media:" } }
          },
          select: {
            id: true,
            type: true,
            key: true,
            value: true,
            normalizedValue: true,
            sourceUrl: true,
            establishmentId: true
          }
        }),
        transaction.importedData.findMany({
          where: {
            organizationId: authorization.organizationId,
            websiteImportId: websiteImport.id,
            type: "OTHER",
            key: { startsWith: "media:" }
          },
          select: { id: true, value: true, updatedAt: true }
        }),
        transaction.mediaAsset.findMany({
          where: {
            organizationId: authorization.organizationId,
            websiteImportId: websiteImport.id,
            status: { in: [...INGESTED_MEDIA_REVIEW_STATUSES] }
          },
          select: { id: true }
        })
      ]);

      const dataCoverage = mediaDecisionCoverage(
        importedRows.map(({ id }) => id),
        parsed.data.dataDecisions
      );
      if (!dataCoverage.complete) {
        return {
          kind: "DATA_REVIEW_INCOMPLETE" as const,
          missingCount: dataCoverage.missingCount,
          unexpectedCount: dataCoverage.unexpectedCount
        };
      }

      const candidateStates = mediaCandidates.map((candidate) => ({
        candidate,
        status: resolveMediaCandidateIngestion({
          value: candidate.value,
          importStatus: websiteImport.status,
          candidateUpdatedAt: candidate.updatedAt,
          importCompletedAt: websiteImport.completedAt,
          now: reviewedAt
        })
      }));
      const pendingMediaCandidates = candidateStates.filter(({ status }) => status === "PENDING");
      if (pendingMediaCandidates.length > 0) {
        return {
          kind: "MEDIA_PENDING" as const,
          pendingCount: pendingMediaCandidates.length
        };
      }

      const coverage = mediaDecisionCoverage(
        expectedMediaRows.map(({ id }) => id),
        parsed.data.mediaDecisions
      );
      if (!coverage.complete) {
        return {
          kind: "MEDIA_REVIEW_INCOMPLETE" as const,
          missingCount: coverage.missingCount,
          unexpectedCount: coverage.unexpectedCount
        };
      }

      const unsupportedAllergenApproval = importedRows.some(
        (row) => row.type === "ALLERGEN" && dataDecisionById.get(row.id) === "APPROVED"
      );
      if (unsupportedAllergenApproval) {
        return { kind: "UNVERIFIED_ALLERGEN" as const };
      }

      const approvedDataIds = importedRows
        .filter((row) => dataDecisionById.get(row.id) === "APPROVED")
        .map(({ id }) => id);
      const rejectedDataIds = importedRows
        .filter((row) => dataDecisionById.get(row.id) === "REJECTED")
        .map(({ id }) => id);
      if (approvedDataIds.length > 0) {
        await transaction.importedData.updateMany({
          where: { id: { in: approvedDataIds }, organizationId: authorization.organizationId },
          data: { validationStatus: "APPROVED" }
        });
      }
      if (rejectedDataIds.length > 0) {
        await transaction.importedData.updateMany({
          where: { id: { in: rejectedDataIds }, organizationId: authorization.organizationId },
          data: { validationStatus: "REJECTED" }
        });
      }

      const productSlugByKey = new Map(
        importedRows
          .filter((row) => row.type === "PRODUCT")
          .flatMap((row) => {
            const id = sourceId(row);
            return id ? [[row.key, stableSourceSlug("yokosushi-product", id)] as const] : [];
          })
      );
      for (const row of importedRows) {
        const decision = dataDecisionById.get(row.id);
        if (!decision) continue;

        if (row.type === "ESTABLISHMENT" && row.establishmentId) {
          const detectedName = stringValue(objectValue(row.value)?.name) ?? row.normalizedValue;
          await transaction.establishment.updateMany({
            where: { id: row.establishmentId, organizationId: authorization.organizationId },
            data:
              decision === "APPROVED"
                ? {
                    validationStatus: "APPROVED",
                    status: "ACTIVE",
                    ...(detectedName ? { name: detectedName } : {})
                  }
                : { validationStatus: "REJECTED", status: "NEEDS_REVIEW" }
          });
        }

        if (decision === "APPROVED" && row.type === "ADDRESS" && row.establishmentId) {
          const address = objectValue(row.value)?.address;
          const addressObject =
            address && !Array.isArray(address) && typeof address === "object"
              ? (address as JsonObject)
              : undefined;
          if (addressObject) {
            const country = stringValue(addressObject.country)?.toUpperCase();
            await transaction.establishment.updateMany({
              where: { id: row.establishmentId, organizationId: authorization.organizationId },
              data: {
                addressLine1:
                  stringValue(addressObject.street) ?? stringValue(addressObject.formatted) ?? null,
                postalCode: stringValue(addressObject.postalCode) ?? null,
                city: stringValue(addressObject.city) ?? null,
                ...(country?.length === 2 ? { countryCode: country } : {})
              }
            });
          }
        }

        if (decision === "APPROVED" && row.type === "PHONE" && row.establishmentId) {
          const phone = stringValue(row.value);
          if (phone) {
            await transaction.establishment.updateMany({
              where: { id: row.establishmentId, organizationId: authorization.organizationId },
              data: { phone }
            });
          }
        }

        if (row.type === "PRODUCT") {
          const id = sourceId(row);
          if (id) {
            const productValue = objectValue(row.value);
            const detectedName = stringValue(productValue?.name) ?? row.normalizedValue;
            const rawDescription = productValue?.description;
            const detectedDescription =
              rawDescription === null ? null : (stringValue(rawDescription) ?? undefined);
            await transaction.menuItem.updateMany({
              where: {
                organizationId: authorization.organizationId,
                brandId: websiteImport.brandId,
                slug: stableSourceSlug("yokosushi-product", id)
              },
              data:
                decision === "APPROVED"
                  ? {
                      validationStatus: "APPROVED",
                      status: "ACTIVE",
                      ...(detectedName ? { name: detectedName } : {}),
                      ...(detectedDescription !== undefined
                        ? { description: detectedDescription }
                        : {})
                    }
                  : { validationStatus: "REJECTED", status: "ARCHIVED" }
            });
          }
        }

        if (row.type === "PRODUCT_CATEGORY") {
          const id = sourceId(row);
          if (id) {
            const categoryValue = objectValue(row.value);
            const detectedName = stringValue(categoryValue?.name) ?? row.normalizedValue;
            const rawDescription = categoryValue?.description;
            const detectedDescription =
              rawDescription === null ? null : (stringValue(rawDescription) ?? undefined);
            const detectedOrder = categoryValue?.order;
            await transaction.productCategory.updateMany({
              where: {
                organizationId: authorization.organizationId,
                brandId: websiteImport.brandId,
                slug: stableSourceSlug("yokosushi-category", id)
              },
              data: {
                validationStatus: decision,
                ...(decision === "APPROVED" && detectedName ? { name: detectedName } : {}),
                ...(decision === "APPROVED" && detectedDescription !== undefined
                  ? { description: detectedDescription }
                  : {}),
                ...(decision === "APPROVED" &&
                typeof detectedOrder === "number" &&
                Number.isInteger(detectedOrder)
                  ? { sortOrder: detectedOrder }
                  : {})
              }
            });
          }
        }

        if (decision === "APPROVED" && row.type === "PRICE") {
          const productKey = row.key.replace(/:price$/, "");
          const productSlug = productSlugByKey.get(productKey);
          const price = objectValue(row.value)?.price;
          if (productSlug && typeof price === "number" && Number.isFinite(price) && price >= 0) {
            await transaction.menuItem.updateMany({
              where: {
                organizationId: authorization.organizationId,
                brandId: websiteImport.brandId,
                slug: productSlug
              },
              data: { price: price.toFixed(2), currency: "EUR" }
            });
          }
        }
      }

      const approvedMediaIds = expectedMediaRows
        .filter(({ id }) => mediaDecisionById.get(id) === "APPROVED")
        .map(({ id }) => id);
      const rejectedMediaIds = expectedMediaRows
        .filter(({ id }) => mediaDecisionById.get(id) === "REJECTED")
        .map(({ id }) => id);
      if (approvedMediaIds.length > 0) {
        await transaction.mediaAsset.updateMany({
          where: {
            id: { in: approvedMediaIds },
            organizationId: authorization.organizationId,
            websiteImportId: websiteImport.id
          },
          data: { status: "APPROVED" }
        });
      }
      if (rejectedMediaIds.length > 0) {
        await transaction.mediaAsset.updateMany({
          where: {
            id: { in: rejectedMediaIds },
            organizationId: authorization.organizationId,
            websiteImportId: websiteImport.id
          },
          data: { status: "REJECTED" }
        });
      }

      const approvedCandidateIds: string[] = [];
      const rejectedCandidateIds: string[] = [];
      const missingCandidates = candidateStates.filter(({ status }) => status === "MISSING");
      for (const { candidate, status } of candidateStates) {
        if (status === "MISSING") {
          const value = objectValue(candidate.value) ?? {};
          await transaction.importedData.update({
            where: { id: candidate.id },
            data: {
              validationStatus: "REJECTED",
              value: {
                ...value,
                ingestionStatus: "FAILED",
                downloadStatus: "FAILED",
                ingestionErrorCode: "MEDIA_JOB_MISSING",
                lastAttemptAt: reviewedAt.toISOString()
              }
            }
          });
          continue;
        }
        if (status === "FAILED") {
          rejectedCandidateIds.push(candidate.id);
          continue;
        }
        if (status === "EXACT_DUPLICATE") {
          approvedCandidateIds.push(candidate.id);
          continue;
        }
        if (status === "STORED") {
          const mediaAssetId = stringValue(objectValue(candidate.value)?.mediaAssetId);
          if (mediaAssetId && mediaDecisionById.get(mediaAssetId) === "APPROVED") {
            approvedCandidateIds.push(candidate.id);
          } else {
            rejectedCandidateIds.push(candidate.id);
          }
        }
      }
      if (approvedCandidateIds.length > 0) {
        await transaction.importedData.updateMany({
          where: {
            id: { in: approvedCandidateIds },
            organizationId: authorization.organizationId,
            websiteImportId: websiteImport.id
          },
          data: { validationStatus: "APPROVED" }
        });
      }
      if (rejectedCandidateIds.length > 0) {
        await transaction.importedData.updateMany({
          where: {
            id: { in: rejectedCandidateIds },
            organizationId: authorization.organizationId,
            websiteImportId: websiteImport.id
          },
          data: { validationStatus: "REJECTED" }
        });
      }

      const mediaDecisionIds = [...mediaDecisionById.keys()];
      const [unreviewedData, undecidedMedia, productsImported, imagesImported] = await Promise.all([
        transaction.importedData.count({
          where: {
            organizationId: authorization.organizationId,
            websiteImportId: websiteImport.id,
            validationStatus: "UNREVIEWED",
            NOT: { key: { startsWith: "media:" } }
          }
        }),
        transaction.mediaAsset.count({
          where: {
            organizationId: authorization.organizationId,
            websiteImportId: websiteImport.id,
            status: { in: [...INGESTED_MEDIA_REVIEW_STATUSES] },
            ...(mediaDecisionIds.length > 0 ? { id: { notIn: mediaDecisionIds } } : {})
          }
        }),
        transaction.importedData.count({
          where: {
            organizationId: authorization.organizationId,
            websiteImportId: websiteImport.id,
            type: "PRODUCT",
            validationStatus: "APPROVED"
          }
        }),
        transaction.mediaAsset.count({
          where: {
            organizationId: authorization.organizationId,
            websiteImportId: websiteImport.id,
            status: "APPROVED"
          }
        })
      ]);
      const reviewComplete = unreviewedData === 0 && undecidedMedia === 0;
      const errorsCount = websiteImport.errorsCount + missingCandidates.length;
      const finalStatus = reviewComplete
        ? errorsCount > 0
          ? "PARTIALLY_COMPLETED"
          : "COMPLETED"
        : "WAITING_FOR_REVIEW";
      await transaction.websiteImport.update({
        where: { id: websiteImport.id },
        data: {
          status: finalStatus,
          productsImported,
          imagesImported,
          errorsCount,
          ...(reviewComplete ? { completedAt: reviewedAt } : {})
        }
      });
      await transaction.auditLog.create({
        data: {
          organizationId: authorization.organizationId,
          actorUserId: authorization.userId,
          action: "APPROVE",
          entityType: "WebsiteImport",
          entityId: websiteImport.id,
          metadata: {
            reviewedData: importedRows.length,
            reviewedMedia: expectedMediaRows.length,
            failedMedia: candidateStates.filter(({ status }) => status === "FAILED").length,
            missingMedia: missingCandidates.length,
            reviewComplete,
            finalStatus
          }
        }
      });
      return { kind: "OK" as const, status: finalStatus, reviewComplete };
    });

    if (!result) return NextResponse.json({ error: "Import introuvable." }, { status: 404 });
    if (result.kind === "CONFLICT") {
      return NextResponse.json(
        {
          error: "Cet import ne peut plus être validé dans son état actuel.",
          status: result.status
        },
        { status: 409 }
      );
    }
    if (result.kind === "MEDIA_PENDING") {
      return NextResponse.json(
        {
          error: "Des copies de médias sont encore en cours. Attendez leur état terminal.",
          pendingMedia: result.pendingCount
        },
        { status: 409 }
      );
    }
    if (result.kind === "DATA_REVIEW_INCOMPLETE") {
      return NextResponse.json(
        {
          error: "Chaque donnée chargée doit recevoir une décision explicite.",
          remaining: result.missingCount,
          invalid: result.unexpectedCount
        },
        { status: 400 }
      );
    }
    if (result.kind === "MEDIA_REVIEW_INCOMPLETE") {
      return NextResponse.json(
        {
          error: "Chaque média ingéré doit être explicitement conservé ou refusé.",
          remaining: result.missingCount,
          invalid: result.unexpectedCount
        },
        { status: 400 }
      );
    }
    if (result.kind === "UNVERIFIED_ALLERGEN") {
      return NextResponse.json(
        {
          error:
            "Les composants détectés ne sont pas qualifiés explicitement comme allergènes par la source. Ils ne peuvent pas être approuvés comme tels."
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ status: result.status, reviewComplete: result.reviewComplete });
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
