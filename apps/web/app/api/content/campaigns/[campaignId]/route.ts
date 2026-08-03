import { db } from "@yokosocial/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isAuthConfigurationError } from "@/lib/auth";
import {
  AuthorizationError,
  authorizationErrorBody,
  requireOrganization
} from "@/lib/authorization";

export const runtime = "nodejs";

const querySchema = z.object({ organizationId: z.string().min(1) });

export async function GET(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Organisation manquante." }, { status: 400 });
  }

  try {
    await requireOrganization(parsed.data.organizationId, undefined, request.headers);
    const { campaignId } = await context.params;
    const campaign = await db.contentCampaign.findFirst({
      where: { id: campaignId, organizationId: parsed.data.organizationId },
      include: {
        establishmentLinks: {
          include: { establishment: { select: { id: true, name: true, city: true } } }
        },
        posts: {
          orderBy: { createdAt: "asc" },
          include: {
            establishmentLinks: {
              include: { establishment: { select: { id: true, name: true } } }
            },
            media: {
              orderBy: { sortOrder: "asc" },
              include: {
                mediaAsset: {
                  select: {
                    id: true,
                    detectedTitle: true,
                    publicUrl: true,
                    qualityScore: true,
                    status: true
                  }
                }
              }
            }
          }
        }
      }
    });
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
    return NextResponse.json({ campaign });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(authorizationErrorBody(error), { status: error.status });
    }
    if (isAuthConfigurationError(error)) {
      return NextResponse.json(
        { error: "Service d’authentification temporairement indisponible." },
        { status: 503 }
      );
    }
    throw error;
  }
}
