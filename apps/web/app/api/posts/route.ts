import { db } from "@yokosocial/database";
import { NextResponse } from "next/server";

import { accessErrorResponse } from "@/lib/api-access";
import { requireOrganization } from "@/lib/authorization";
import { postListQuerySchema } from "@/lib/post-contract";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = postListQuerySchema.safeParse(
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
    const brand = await db.restaurantBrand.findFirst({
      where: { id: query.data.brandId, organizationId: authorization.organizationId },
      select: { id: true }
    });
    if (!brand) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });

    const posts = await db.socialPost.findMany({
      where: {
        organizationId: authorization.organizationId,
        brandId: brand.id,
        ...(query.data.status ? { status: query.data.status } : {})
      },
      include: {
        establishmentLinks: {
          include: {
            establishment: { select: { id: true, name: true, city: true } }
          },
          orderBy: { createdAt: "asc" }
        },
        media: {
          include: {
            mediaAsset: {
              select: {
                id: true,
                originalName: true,
                publicUrl: true,
                mimeType: true,
                width: true,
                height: true,
                qualityScore: true,
                editorialCategory: true,
                status: true
              }
            },
            mediaVariant: {
              select: { id: true, publicUrl: true, mimeType: true, width: true, height: true }
            }
          },
          orderBy: { sortOrder: "asc" }
        },
        publicationJobs: {
          include: {
            socialAccount: {
              select: { id: true, platform: true, displayName: true, username: true }
            }
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      take: 200
    });

    return NextResponse.json({ posts });
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
