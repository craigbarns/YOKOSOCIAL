import { db } from "@yokosocial/database";
import { NextResponse } from "next/server";

import { accessErrorResponse } from "@/lib/api-access";
import { websiteImportDetailQuerySchema } from "@/lib/import-contract";
import { resolveMediaCandidateIngestion } from "@/lib/import-review-contract";
import { requireOrganization } from "@/lib/authorization";

export const runtime = "nodejs";

function pageOf<T extends { id: string }>(rows: T[], pageSize: number) {
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items,
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null
  };
}

function candidateValue(
  value: unknown,
  input: {
    importStatus: string;
    candidateUpdatedAt: Date;
    importCompletedAt: Date | null;
    now: Date;
  }
): unknown {
  const ingestionStatus = resolveMediaCandidateIngestion({
    value,
    importStatus: input.importStatus,
    candidateUpdatedAt: input.candidateUpdatedAt,
    importCompletedAt: input.importCompletedAt,
    now: input.now
  });
  if (!ingestionStatus || !value || Array.isArray(value) || typeof value !== "object") return value;

  return {
    ...(value as Record<string, unknown>),
    ingestionStatus,
    ...(ingestionStatus === "MISSING"
      ? {
          downloadStatus: "FAILED",
          ingestionErrorCode: "MEDIA_JOB_MISSING"
        }
      : {})
  };
}

export async function GET(request: Request, context: { params: Promise<{ importId: string }> }) {
  const parsed = websiteImportDetailQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres du détail d’import invalides." },
      { status: 400 }
    );
  }

  try {
    await requireOrganization(parsed.data.organizationId, undefined, request.headers);
    const { importId } = await context.params;
    const websiteImport = await db.websiteImport.findFirst({
      where: { id: importId, organizationId: parsed.data.organizationId },
      include: {
        brand: {
          select: {
            id: true,
            name: true,
            establishments: { orderBy: { name: "asc" } }
          }
        },
        pages: { orderBy: { discoveredAt: "asc" }, take: 200 }
      }
    });
    if (!websiteImport) {
      return NextResponse.json({ error: "Import introuvable." }, { status: 404 });
    }

    const dataWhere = {
      organizationId: parsed.data.organizationId,
      websiteImportId: websiteImport.id,
      ...(parsed.data.dataAfter ? { id: { gt: parsed.data.dataAfter } } : {})
    };
    const mediaWhere = {
      organizationId: parsed.data.organizationId,
      websiteImportId: websiteImport.id,
      ...(parsed.data.mediaAfter ? { id: { gt: parsed.data.mediaAfter } } : {})
    };
    const [dataRows, mediaRows, dataTotal, mediaTotal] = await Promise.all([
      parsed.data.includeData
        ? db.importedData.findMany({
            where: dataWhere,
            orderBy: { id: "asc" },
            take: parsed.data.pageSize + 1
          })
        : Promise.resolve([]),
      parsed.data.includeMedia
        ? db.mediaAsset.findMany({
            where: mediaWhere,
            orderBy: { id: "asc" },
            take: parsed.data.pageSize + 1,
            select: {
              id: true,
              publicUrl: true,
              detectedTitle: true,
              originalName: true,
              sourceUrl: true,
              sourcePageUrl: true,
              width: true,
              height: true,
              qualityScore: true,
              category: true,
              editorialCategory: true,
              status: true
            }
          })
        : Promise.resolve([]),
      parsed.data.includeData
        ? db.importedData.count({
            where: {
              organizationId: parsed.data.organizationId,
              websiteImportId: websiteImport.id
            }
          })
        : Promise.resolve(0),
      parsed.data.includeMedia
        ? db.mediaAsset.count({
            where: {
              organizationId: parsed.data.organizationId,
              websiteImportId: websiteImport.id
            }
          })
        : Promise.resolve(0)
    ]);
    const dataPage = pageOf(dataRows, parsed.data.pageSize);
    const mediaPage = pageOf(mediaRows, parsed.data.pageSize);
    const now = new Date();

    return NextResponse.json(
      {
        import: {
          ...websiteImport,
          importedData: dataPage.items.map((row) => ({
            ...row,
            value: candidateValue(row.value, {
              importStatus: websiteImport.status,
              candidateUpdatedAt: row.updatedAt,
              importCompletedAt: websiteImport.completedAt,
              now
            })
          })),
          mediaAssets: mediaPage.items
        },
        pagination: {
          importedData: {
            included: parsed.data.includeData,
            total: dataTotal,
            nextCursor: dataPage.nextCursor
          },
          mediaAssets: {
            included: parsed.data.includeMedia,
            total: mediaTotal,
            nextCursor: mediaPage.nextCursor
          }
        }
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
