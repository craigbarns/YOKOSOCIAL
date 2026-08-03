import { db } from "@yokosocial/database";
import { NextResponse } from "next/server";

import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import { requireOrganization, requireTrustedMutationOrigin } from "@/lib/authorization";
import {
  normalizeYokoSushiWebsiteUrl,
  websiteImportListQuerySchema,
  websiteImportRequestSchema
} from "@/lib/import-contract";
import { enqueueTenantJob, QueueUnavailableError } from "@/lib/job-queue";

export const runtime = "nodejs";

const activeImportStatuses = [
  "PENDING",
  "CRAWLING",
  "ANALYZING",
  "WAITING_FOR_REVIEW",
  "IMPORTING"
] as const;

export async function POST(request: Request) {
  try {
    requireTrustedMutationOrigin(request);
    const parsed = websiteImportRequestSchema.safeParse(
      await readJsonWithLimit(request, 32 * 1024)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Demande d’import invalide.", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const authorization = await requireOrganization(
      parsed.data.organizationId,
      ["OWNER", "ADMIN", "EDITOR"],
      request.headers
    );
    const brand = await db.restaurantBrand.findFirst({
      where: { id: parsed.data.brandId, organizationId: parsed.data.organizationId },
      select: { id: true }
    });
    if (!brand) {
      return NextResponse.json(
        { error: "Marque introuvable dans cette organisation." },
        { status: 404 }
      );
    }

    const [runningImport, recentImport] = await Promise.all([
      db.websiteImport.findFirst({
        where: {
          organizationId: authorization.organizationId,
          brandId: brand.id,
          status: { in: [...activeImportStatuses] }
        },
        select: { id: true, status: true }
      }),
      db.websiteImport.findFirst({
        where: {
          organizationId: authorization.organizationId,
          brandId: brand.id,
          createdAt: { gte: new Date(Date.now() - 60_000) }
        },
        select: { id: true }
      })
    ]);
    if (runningImport) {
      return NextResponse.json(
        {
          error: "Une analyse est déjà en cours pour cette marque.",
          importId: runningImport.id,
          status: runningImport.status
        },
        { status: 409 }
      );
    }
    if (recentImport) {
      return NextResponse.json(
        { error: "Patientez une minute avant de relancer une analyse." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const websiteUrl = normalizeYokoSushiWebsiteUrl(parsed.data.websiteUrl);
    let websiteImport;
    try {
      websiteImport = await db.$transaction(async (transaction) => {
        const created = await transaction.websiteImport.create({
          data: {
            organizationId: parsed.data.organizationId,
            brandId: brand.id,
            createdById: authorization.userId,
            websiteUrl,
            mode: "REAL",
            status: "PENDING"
          }
        });

        await transaction.auditLog.create({
          data: {
            organizationId: parsed.data.organizationId,
            actorUserId: authorization.userId,
            action: "IMPORT",
            entityType: "WebsiteImport",
            entityId: created.id,
            metadata: { status: "PENDING", websiteUrl }
          }
        });
        return created;
      });
    } catch (error) {
      // PostgreSQL owns the final concurrency decision through a partial unique index. This
      // read turns a concurrent duplicate into a stable API conflict without exposing DB details.
      const concurrentImport = await db.websiteImport.findFirst({
        where: {
          organizationId: authorization.organizationId,
          brandId: brand.id,
          status: { in: [...activeImportStatuses] }
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true }
      });
      if (!concurrentImport) throw error;
      return NextResponse.json(
        {
          error: "Une analyse est déjà en cours ou attend votre validation pour cette marque.",
          importId: concurrentImport.id,
          status: concurrentImport.status
        },
        { status: 409 }
      );
    }

    try {
      const queued = await enqueueTenantJob("website-import.scan", {
        organizationId: parsed.data.organizationId,
        actorId: authorization.userId,
        resourceId: websiteImport.id,
        idempotencyKey: `website-import-${websiteImport.id}`
      });

      return NextResponse.json(
        { import: websiteImport, queued: true, queueJobId: queued.jobId },
        { status: 202 }
      );
    } catch (error) {
      await db.websiteImport.update({
        where: { id: websiteImport.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorsCount: 1,
          errorMessage:
            "Le worker d’import n’est pas disponible. Réessayez après vérification de Redis."
        }
      });
      console.error(
        "[imports] mise en file impossible",
        error instanceof QueueUnavailableError ? "QUEUE_UNAVAILABLE" : "QUEUE_ERROR"
      );
      return NextResponse.json(
        {
          error: "L’analyse n’a pas pu être mise en file.",
          importId: websiteImport.id,
          status: "FAILED"
        },
        { status: 503 }
      );
    }
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = websiteImportListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètres de recherche invalides." }, { status: 400 });
  }

  try {
    await requireOrganization(parsed.data.organizationId, undefined, request.headers);
    const imports = await db.websiteImport.findMany({
      where: {
        organizationId: parsed.data.organizationId,
        ...(parsed.data.brandId ? { brandId: parsed.data.brandId } : {})
      },
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit,
      include: { brand: { select: { id: true, name: true } } }
    });
    return NextResponse.json({ imports });
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
