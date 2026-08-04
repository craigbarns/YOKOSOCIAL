import { db } from "@yokosocial/database";
import { resolveNextAction } from "@yokosocial/shared";
import { NextResponse } from "next/server";

import { accessErrorResponse } from "@/lib/api-access";
import { requireOrganization } from "@/lib/authorization";
import { todayQuerySchema } from "@/lib/today-contract";
import { buildTodaySnapshot } from "@/lib/today-snapshot";

export const runtime = "nodejs";

const UPCOMING_LIMIT = 3;

export async function GET(request: Request) {
  const query = todayQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!query.success) {
    return NextResponse.json({ error: "Paramètres de recherche invalides." }, { status: 400 });
  }

  try {
    const authorization = await requireOrganization(
      query.data.organizationId,
      undefined,
      request.headers
    );
    const scope = { organizationId: authorization.organizationId, brandId: query.data.brandId };

    const brand = await db.restaurantBrand.findFirst({
      where: { id: query.data.brandId, organizationId: authorization.organizationId },
      select: { id: true, name: true, websiteUrl: true }
    });
    if (!brand) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });

    const [
      latestImport,
      pendingProducts,
      validatedProducts,
      pendingMedia,
      validatedMedia,
      postGroups,
      upcoming,
      connectedSocialAccounts,
      appliedCorrections
    ] = await Promise.all([
      db.websiteImport.findFirst({
        where: scope,
        orderBy: { createdAt: "desc" },
        select: {
          status: true,
          pagesScanned: true,
          productsDetected: true,
          imagesDetected: true
        }
      }),
      db.menuItem.count({ where: { ...scope, validationStatus: "UNREVIEWED" } }),
      db.menuItem.count({ where: { ...scope, validationStatus: "APPROVED" } }),
      db.mediaAsset.count({ where: { ...scope, status: "NEEDS_REVIEW" } }),
      db.mediaAsset.count({ where: { ...scope, status: "APPROVED" } }),
      db.socialPost.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
      db.socialPost.findMany({
        where: { ...scope, status: { in: ["SCHEDULED", "PUBLISHING"] }, scheduledAt: { not: null } },
        orderBy: { scheduledAt: "asc" },
        take: UPCOMING_LIMIT,
        select: { id: true, title: true, scheduledAt: true }
      }),
      db.socialAccount.count({ where: { ...scope, status: "CONNECTED" } }),
      db.userFeedback.count({
        where: { organizationId: authorization.organizationId, target: "SOCIAL_POST" }
      })
    ]);

    const postsByStatus: Record<string, number> = {};
    for (const group of postGroups) {
      postsByStatus[group.status] = group._count._all;
    }

    const snapshot = buildTodaySnapshot({
      brandName: brand.name,
      websiteUrl: brand.websiteUrl,
      latestImport,
      pendingProducts,
      validatedProducts,
      pendingMedia,
      validatedMedia,
      postsByStatus,
      upcoming: upcoming.flatMap((post) =>
        post.scheduledAt
          ? [{ id: post.id, title: post.title, scheduledAt: post.scheduledAt }]
          : []
      ),
      connectedSocialAccounts,
      appliedCorrections
    });

    return NextResponse.json({ snapshot, action: resolveNextAction(snapshot) });
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
