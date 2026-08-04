import { db } from "@yokosocial/database";
import { contentCampaignGenerationConfigSchema } from "@yokosocial/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import { requireOrganization, requireTrustedMutationOrigin } from "@/lib/authorization";
import { enqueueTenantJob, QueueUnavailableError } from "@/lib/job-queue";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 64 * 1024;
const inputSchema = contentCampaignGenerationConfigSchema
  .extend({
    organizationId: z.string().min(1),
    brandId: z.string().min(1)
  })
  .superRefine((value, context) => {
    if (new Set(value.establishmentIds).size !== value.establishmentIds.length) {
      context.addIssue({
        code: "custom",
        path: ["establishmentIds"],
        message: "Un établissement ne peut être sélectionné qu’une fois."
      });
    }
    if (new Set(value.platforms).size !== value.platforms.length) {
      context.addIssue({
        code: "custom",
        path: ["platforms"],
        message: "Un réseau ne peut être sélectionné qu’une fois."
      });
    }
  });

async function readInput(request: Request) {
  try {
    return inputSchema.safeParse(await readJsonWithLimit(request, MAX_BODY_BYTES));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    requireTrustedMutationOrigin(request);
    const parsed = await readInput(request);
    if (!parsed?.success) {
      return NextResponse.json({ error: "Paramètres de génération invalides." }, { status: 400 });
    }
    const authorization = await requireOrganization(
      parsed.data.organizationId,
      ["OWNER", "ADMIN", "EDITOR"],
      request.headers
    );

    const rateLimit = checkRateLimit(`gen_${authorization.organizationId}`, {
      limit: 10,
      windowMs: 60_000
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.resetMs);
    }
    const brand = await db.restaurantBrand.findFirst({
      where: { id: parsed.data.brandId, organizationId: authorization.organizationId },
      select: { id: true, name: true }
    });
    if (!brand) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });

    await db.contentCampaign.updateMany({
      where: {
        organizationId: authorization.organizationId,
        brandId: brand.id,
        status: { in: ["DRAFT", "ACTIVE"] },
        createdAt: { lt: new Date(Date.now() - 60_000) }
      },
      data: { status: "CANCELLED" }
    });

    const existingCampaign = await db.contentCampaign.findFirst({
      where: {
        organizationId: authorization.organizationId,
        brandId: brand.id,
        status: "ACTIVE",
        createdAt: { gte: new Date(Date.now() - 60_000) }
      },
      select: { id: true, status: true }
    });
    if (existingCampaign) {
      return NextResponse.json(
        {
          error: "Une génération est déjà en cours. Veuillez patienter quelques secondes.",
          campaignId: existingCampaign.id,
          status: existingCampaign.status
        },
        { status: 409, headers: { "Retry-After": "10" } }
      );
    }

    const uniqueEstablishmentIds = [...new Set(parsed.data.establishmentIds)];
    const approvedEstablishments = await db.establishment.count({
      where: {
        organizationId: authorization.organizationId,
        brandId: brand.id,
        id: { in: uniqueEstablishmentIds },
        status: "ACTIVE",
        validationStatus: "APPROVED"
      }
    });
    if (approvedEstablishments !== uniqueEstablishmentIds.length) {
      return NextResponse.json(
        { error: "Chaque établissement sélectionné doit d’abord être validé." },
        { status: 409 }
      );
    }

    const [approvedProducts, approvedMedia] = await Promise.all([
      db.menuItem.count({
        where: {
          organizationId: authorization.organizationId,
          brandId: brand.id,
          validationStatus: "APPROVED",
          status: "ACTIVE"
        }
      }),
      db.mediaAsset.count({
        where: {
          organizationId: authorization.organizationId,
          brandId: brand.id,
          status: "APPROVED"
        }
      })
    ]);
    if (approvedProducts === 0 || approvedMedia === 0) {
      return NextResponse.json(
        {
          error:
            "Validez au moins un produit et une photo copiée dans la médiathèque avant de générer."
        },
        { status: 409 }
      );
    }

    const generationConfig = contentCampaignGenerationConfigSchema.parse({
      establishmentIds: uniqueEstablishmentIds,
      platforms: parsed.data.platforms,
      count: parsed.data.count,
      startDate: parsed.data.startDate,
      preferredTopics: parsed.data.preferredTopics
    });
    const campaign = await db.$transaction(async (transaction) => {
      const created = await transaction.contentCampaign.create({
        data: {
          organizationId: authorization.organizationId,
          brandId: brand.id,
          name: `Plan éditorial ${new Date(generationConfig.startDate).toLocaleDateString("fr-FR")}`,
          objective: `Générer ${generationConfig.count} brouillons validables`,
          startsAt: new Date(generationConfig.startDate),
          status: "DRAFT",
          generationConfig,
          establishmentLinks: {
            create: uniqueEstablishmentIds.map((establishmentId) => ({
              organizationId: authorization.organizationId,
              establishmentId
            }))
          }
        }
      });
      await transaction.auditLog.create({
        data: {
          organizationId: authorization.organizationId,
          actorUserId: authorization.userId,
          action: "CREATE",
          entityType: "ContentCampaign",
          entityId: created.id,
          metadata: {
            count: generationConfig.count,
            platforms: generationConfig.platforms,
            provider: process.env.AI_MODE === "real" ? "openai" : "mock"
          }
        }
      });
      return created;
    });

    try {
      const job = await enqueueTenantJob("content.generate", {
        organizationId: authorization.organizationId,
        actorId: authorization.userId,
        resourceId: campaign.id,
        idempotencyKey: `content-generate-${campaign.id}`
      });
      return NextResponse.json({ campaign, queued: true, queueJobId: job.jobId }, { status: 202 });
    } catch (error) {
      await db.contentCampaign.update({
        where: { id: campaign.id },
        data: { status: "CANCELLED" }
      });
      console.error(
        "[content] mise en file impossible",
        error instanceof QueueUnavailableError ? "QUEUE_UNAVAILABLE" : "QUEUE_ERROR"
      );
      return NextResponse.json(
        { error: "La génération n’a pas pu être mise en file.", campaignId: campaign.id },
        { status: 503 }
      );
    }
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
