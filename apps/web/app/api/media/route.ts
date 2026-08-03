import { db, type MediaStatus, type Prisma } from "@yokosocial/database";
import { NextResponse } from "next/server";

import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import {
  AuthorizationError,
  requireOrganization,
  requireTrustedMutationOrigin
} from "@/lib/authorization";
import { mediaListQuerySchema, mediaPatchSchema } from "@/lib/catalog-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;
const recommendedStatuses: MediaStatus[] = ["APPROVED", "NEEDS_REVIEW"];

const mediaSelection = {
  id: true,
  brandId: true,
  publicUrl: true,
  sourceUrl: true,
  sourcePageUrl: true,
  originalName: true,
  mimeType: true,
  width: true,
  height: true,
  byteSize: true,
  aspectRatio: true,
  altText: true,
  detectedTitle: true,
  detectedDescription: true,
  category: true,
  editorialCategory: true,
  qualityScore: true,
  instagramPotentialScore: true,
  facebookPotentialScore: true,
  storyPotentialScore: true,
  carouselPotentialScore: true,
  reelPotentialScore: true,
  status: true,
  usageCount: true,
  lastUsedAt: true,
  importedAt: true,
  updatedAt: true,
  menuItem: { select: { id: true, name: true } },
  establishmentLinks: {
    orderBy: { establishment: { name: "asc" } },
    select: {
      validated: true,
      establishment: { select: { id: true, name: true, city: true } }
    }
  }
} as const;

type SelectedMedia = Prisma.MediaAssetGetPayload<{ select: typeof mediaSelection }>;

function mediaDTO(media: SelectedMedia) {
  return {
    id: media.id,
    brandId: media.brandId,
    title: media.detectedTitle ?? media.originalName,
    description: media.detectedDescription,
    altText: media.altText,
    publicUrl: media.publicUrl,
    sourceUrl: media.sourceUrl,
    sourcePageUrl: media.sourcePageUrl,
    mimeType: media.mimeType,
    width: media.width,
    height: media.height,
    byteSize: media.byteSize?.toString() ?? null,
    aspectRatio: media.aspectRatio,
    category: media.category,
    editorialCategory: media.editorialCategory,
    status: media.status,
    qualityScore: media.qualityScore,
    potentialScores: {
      instagram: media.instagramPotentialScore,
      facebook: media.facebookPotentialScore,
      story: media.storyPotentialScore,
      carousel: media.carouselPotentialScore,
      reel: media.reelPotentialScore
    },
    usageCount: media.usageCount,
    lastUsedAt: media.lastUsedAt,
    importedAt: media.importedAt,
    updatedAt: media.updatedAt,
    menuItem: media.menuItem,
    establishments: media.establishmentLinks.map(({ establishment, validated }) => ({
      ...establishment,
      validated
    }))
  };
}

async function readPatchInput(request: Request) {
  return mediaPatchSchema.safeParse(await readJsonWithLimit(request, MAX_BODY_BYTES));
}

async function requireTenantBrand(organizationId: string, brandId: string): Promise<void> {
  const brand = await db.restaurantBrand.findFirst({
    where: { id: brandId, organizationId },
    select: { id: true }
  });
  if (!brand) throw new AuthorizationError();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = mediaListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Filtres de médiathèque invalides." }, { status: 400 });
  }

  try {
    const context = await requireOrganization(
      parsed.data.organizationId,
      undefined,
      request.headers
    );
    await requireTenantBrand(context.organizationId, parsed.data.brandId);

    const where: Prisma.MediaAssetWhereInput = {
      organizationId: context.organizationId,
      brandId: parsed.data.brandId,
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
      ...(parsed.data.establishmentId
        ? { establishmentLinks: { some: { establishmentId: parsed.data.establishmentId } } }
        : {}),
      ...(parsed.data.neverUsed ? { usageCount: 0 } : {}),
      ...(parsed.data.bestInstagram ? { instagramPotentialScore: { gte: 70 } } : {})
    };
    if (parsed.data.search) {
      where.OR = [
        { originalName: { contains: parsed.data.search, mode: "insensitive" } },
        { detectedTitle: { contains: parsed.data.search, mode: "insensitive" } },
        { detectedDescription: { contains: parsed.data.search, mode: "insensitive" } },
        { altText: { contains: parsed.data.search, mode: "insensitive" } },
        { menuItem: { name: { contains: parsed.data.search, mode: "insensitive" } } }
      ];
    }
    if (parsed.data.status) where.status = parsed.data.status;
    else if (parsed.data.review) where.status = "NEEDS_REVIEW";
    else if (parsed.data.bestInstagram) where.status = { in: recommendedStatuses };
    const skip = (parsed.data.page - 1) * parsed.data.limit;
    const [total, media] = await db.$transaction([
      db.mediaAsset.count({ where }),
      db.mediaAsset.findMany({
        where,
        skip,
        take: parsed.data.limit,
        orderBy: parsed.data.bestInstagram
          ? [{ instagramPotentialScore: "desc" }, { qualityScore: "desc" }, { createdAt: "desc" }]
          : [{ createdAt: "desc" }],
        select: mediaSelection
      })
    ]);

    return NextResponse.json(
      {
        media: media.map(mediaDTO),
        pagination: {
          page: parsed.data.page,
          limit: parsed.data.limit,
          total,
          pages: Math.ceil(total / parsed.data.limit)
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

export async function PATCH(request: Request) {
  try {
    requireTrustedMutationOrigin(request);
    const parsed = await readPatchInput(request);
    if (!parsed.success) {
      return NextResponse.json({ error: "Correction de média invalide." }, { status: 400 });
    }

    const context = await requireOrganization(
      parsed.data.organizationId,
      ["OWNER", "ADMIN", "EDITOR"],
      request.headers
    );
    await requireTenantBrand(context.organizationId, parsed.data.brandId);

    const existing = await db.mediaAsset.findFirst({
      where: {
        id: parsed.data.mediaAssetId,
        organizationId: context.organizationId,
        brandId: parsed.data.brandId
      },
      select: { id: true }
    });
    if (!existing) throw new AuthorizationError();

    if (parsed.data.establishmentIds) {
      const establishments = await db.establishment.count({
        where: {
          id: { in: parsed.data.establishmentIds },
          organizationId: context.organizationId,
          brandId: parsed.data.brandId
        }
      });
      if (establishments !== parsed.data.establishmentIds.length) throw new AuthorizationError();
    }

    const updateData: Prisma.MediaAssetUpdateInput = {};
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.editorialCategory !== undefined) {
      updateData.editorialCategory = parsed.data.editorialCategory;
    }
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

    const media = await db.$transaction(async (transaction) => {
      const hasMetadataChange =
        parsed.data.category !== undefined ||
        parsed.data.editorialCategory !== undefined ||
        parsed.data.status !== undefined;
      if (hasMetadataChange) {
        await transaction.mediaAsset.update({
          where: { id: existing.id },
          data: updateData
        });
      }

      if (parsed.data.establishmentIds !== undefined) {
        await transaction.mediaAssetEstablishment.deleteMany({
          where: {
            organizationId: context.organizationId,
            mediaAssetId: existing.id
          }
        });
        if (parsed.data.establishmentIds.length > 0) {
          await transaction.mediaAssetEstablishment.createMany({
            data: parsed.data.establishmentIds.map((establishmentId) => ({
              organizationId: context.organizationId,
              mediaAssetId: existing.id,
              establishmentId,
              confidence: 1,
              validated: true
            }))
          });
        }
      }

      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "UPDATE",
          entityType: "MediaAsset",
          entityId: existing.id,
          metadata: {
            changedFields: [
              ...(parsed.data.category !== undefined ? ["category"] : []),
              ...(parsed.data.editorialCategory !== undefined ? ["editorialCategory"] : []),
              ...(parsed.data.status !== undefined ? ["status"] : []),
              ...(parsed.data.establishmentIds !== undefined ? ["establishments"] : [])
            ],
            ...(parsed.data.establishmentIds !== undefined
              ? { establishmentCount: parsed.data.establishmentIds.length }
              : {})
          }
        }
      });

      return transaction.mediaAsset.findFirstOrThrow({
        where: { id: existing.id, organizationId: context.organizationId },
        select: mediaSelection
      });
    });

    return NextResponse.json(
      { media: mediaDTO(media) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
