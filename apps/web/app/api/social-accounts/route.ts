import { db, type Prisma } from "@yokosocial/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import { requireOrganization, requireTrustedMutationOrigin } from "@/lib/authorization";
import { createServerPostizProvider, serverPostizGroupId } from "@/lib/postiz-provider";

export const runtime = "nodejs";

const querySchema = z.object({
  organizationId: z.string().trim().min(1),
  brandId: z.string().trim().min(1)
});
const mutationSchema = z.discriminatedUnion("action", [
  querySchema.extend({ action: z.enum(["test", "sync"]) }),
  querySchema.extend({
    action: z.literal("connect_manual"),
    platform: z.enum(["INSTAGRAM", "FACEBOOK"]),
    displayName: z.string().trim().min(1),
    username: z.string().trim().optional()
  })
]);

function supportedPlatform(identifier: string): "INSTAGRAM" | "FACEBOOK" | undefined {
  if (identifier === "facebook") return "FACEBOOK";
  if (identifier === "instagram" || identifier === "instagram-standalone") return "INSTAGRAM";
  return undefined;
}

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Organisation ou marque manquante." }, { status: 400 });
  }
  try {
    const authorization = await requireOrganization(
      parsed.data.organizationId,
      undefined,
      request.headers
    );
    const accounts = await db.socialAccount.findMany({
      where: {
        organizationId: authorization.organizationId,
        brandId: parsed.data.brandId,
        provider: "postiz"
      },
      select: {
        id: true,
        establishmentId: true,
        platform: true,
        displayName: true,
        username: true,
        remoteIntegrationId: true,
        status: true,
        lastSyncedAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: [{ platform: "asc" }, { displayName: "asc" }]
    });
    return NextResponse.json({
      accounts,
      mode: process.env.POSTIZ_MODE === "real" ? "real" : "mock"
    });
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    requireTrustedMutationOrigin(request);
    const parsed = mutationSchema.safeParse(await readJsonWithLimit(request, 32 * 1024));
    if (!parsed.success) {
      return NextResponse.json({ error: "Demande Postiz invalide." }, { status: 400 });
    }
    const authorization = await requireOrganization(
      parsed.data.organizationId,
      ["OWNER", "ADMIN"],
      request.headers
    );
    const brand = await db.restaurantBrand.findFirst({
      where: { id: parsed.data.brandId, organizationId: authorization.organizationId },
      select: { id: true }
    });
    if (!brand) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });

    if (parsed.data.action === "connect_manual") {
      const now = new Date();
      const externalId = `manual-${parsed.data.platform.toLowerCase()}-${Date.now()}`;
      const account = await db.socialAccount.create({
        data: {
          organizationId: authorization.organizationId,
          brandId: brand.id,
          provider: "postiz",
          platform: parsed.data.platform,
          displayName: parsed.data.displayName,
          username: parsed.data.username || null,
          externalId,
          remoteIntegrationId: externalId,
          status: "CONNECTED",
          lastSyncedAt: now
        },
        select: {
          id: true,
          platform: true,
          displayName: true,
          username: true,
          remoteIntegrationId: true,
          status: true,
          lastSyncedAt: true
        }
      });
      return NextResponse.json({
        connection: { connected: true, provider: "postiz", mode: "real" },
        accounts: [account]
      });
    }

    const provider = createServerPostizProvider(authorization.organizationId);
    const connection = await provider.testConnection();
    if (parsed.data.action === "test") return NextResponse.json({ connection });
    if (!connection.connected) {
      return NextResponse.json({ error: "Postiz n’est pas connecté." }, { status: 503 });
    }

    const groupId = serverPostizGroupId();
    const integrations = await provider.listIntegrations(groupId ? { groupId } : {});
    const supported = integrations.flatMap((integration) => {
      const platform = supportedPlatform(integration.identifier);
      return platform ? [{ integration, platform }] : [];
    });
    const remoteIds = supported.map(({ integration }) => integration.id);
    const claimedByAnotherBrand = await db.socialAccount.findFirst({
      where: {
        organizationId: authorization.organizationId,
        provider: "postiz",
        externalId: { in: remoteIds },
        brandId: { not: brand.id }
      },
      select: { id: true }
    });
    if (claimedByAnotherBrand) {
      return NextResponse.json(
        {
          error: "Un compte Postiz est déjà rattaché à une autre marque de cette organisation."
        },
        { status: 409 }
      );
    }
    const now = new Date();
    const accounts = await db.$transaction(async (transaction) => {
      const synced = [];
      await transaction.socialAccount.updateMany({
        where: {
          organizationId: authorization.organizationId,
          brandId: brand.id,
          provider: "postiz",
          ...(remoteIds.length > 0 ? { externalId: { notIn: remoteIds } } : {})
        },
        data: { status: "DISCONNECTED", remoteIntegrationId: null, lastSyncedAt: now }
      });
      for (const { integration, platform } of supported) {
        const metadata: Prisma.InputJsonObject = {
          identifier: integration.identifier,
          disabled: integration.disabled ?? false,
          ...(integration.picture ? { picture: integration.picture } : {}),
          ...(integration.customer
            ? { customer: { id: integration.customer.id, name: integration.customer.name } }
            : {})
        };
        const account = await transaction.socialAccount.upsert({
          where: {
            organizationId_provider_externalId: {
              organizationId: authorization.organizationId,
              provider: "postiz",
              externalId: integration.id
            }
          },
          update: {
            platform,
            displayName: integration.name,
            username: integration.profile ?? null,
            remoteIntegrationId: integration.id,
            status: integration.disabled ? "ERROR" : "CONNECTED",
            lastSyncedAt: now,
            metadata
          },
          create: {
            organizationId: authorization.organizationId,
            brandId: brand.id,
            provider: "postiz",
            platform,
            displayName: integration.name,
            username: integration.profile ?? null,
            externalId: integration.id,
            remoteIntegrationId: integration.id,
            status: integration.disabled ? "ERROR" : "CONNECTED",
            lastSyncedAt: now,
            metadata
          },
          select: {
            id: true,
            platform: true,
            displayName: true,
            username: true,
            remoteIntegrationId: true,
            status: true,
            lastSyncedAt: true
          }
        });
        synced.push(account);
      }
      await transaction.auditLog.create({
        data: {
          organizationId: authorization.organizationId,
          actorUserId: authorization.userId,
          action: "UPDATE",
          entityType: "SocialAccount",
          entityId: brand.id,
          metadata: {
            provider: "postiz",
            mode: provider.mode,
            integrationsReceived: integrations.length,
            accountsSynced: synced.length
          }
        }
      });
      return synced;
    });
    return NextResponse.json({
      connection,
      accounts,
      ignoredIntegrations: integrations.length - supported.length
    });
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    console.error(
      "[postiz] opération impossible",
      error instanceof Error ? error.name : "POSTIZ_ERROR"
    );
    return NextResponse.json(
      { error: "La connexion Postiz n’a pas pu être vérifiée. Consultez les journaux serveur." },
      { status: 502 }
    );
  }
}
