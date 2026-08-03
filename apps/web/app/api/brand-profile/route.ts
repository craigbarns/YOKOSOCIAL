import { db, Prisma, type Prisma as PrismaTypes } from "@yokosocial/database";
import { NextResponse } from "next/server";

import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import {
  AuthorizationError,
  requireOrganization,
  requireTrustedMutationOrigin
} from "@/lib/authorization";
import { brandProfilePatchSchema, brandProfileQuerySchema } from "@/lib/brand-settings-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

const profileSelection = {
  id: true,
  brandId: true,
  logoMediaAssetId: true,
  slogan: true,
  story: true,
  cuisineType: true,
  positioning: true,
  targetAudience: true,
  geographicArea: true,
  priceRange: true,
  tones: true,
  colors: true,
  typography: true,
  allowedExpressions: true,
  wordsToAvoid: true,
  allowedEmojis: true,
  emojiUsageLevel: true,
  languages: true,
  orderLinks: true,
  socialPlatforms: true,
  customInstruction: true,
  createdAt: true,
  updatedAt: true,
  logoMediaAsset: {
    select: {
      id: true,
      organizationId: true,
      brandId: true,
      publicUrl: true,
      altText: true,
      width: true,
      height: true,
      mimeType: true,
      status: true
    }
  }
} as const;

type SelectedProfile = PrismaTypes.BrandProfileGetPayload<{ select: typeof profileSelection }>;

function profileDTO(profile: SelectedProfile, organizationId: string, brandId: string) {
  const { logoMediaAsset, ...fields } = profile;
  const validLogo =
    logoMediaAsset?.organizationId === organizationId && logoMediaAsset.brandId === brandId
      ? {
          id: logoMediaAsset.id,
          publicUrl: logoMediaAsset.publicUrl,
          altText: logoMediaAsset.altText,
          width: logoMediaAsset.width,
          height: logoMediaAsset.height,
          mimeType: logoMediaAsset.mimeType,
          status: logoMediaAsset.status
        }
      : null;

  return { ...fields, logo: validLogo };
}

async function requireTenantBrand(organizationId: string, brandId: string) {
  const brand = await db.restaurantBrand.findFirst({
    where: { id: brandId, organizationId },
    select: { id: true, name: true, websiteUrl: true }
  });
  if (!brand) throw new AuthorizationError();
  return brand;
}

export async function GET(request: Request) {
  const parsed = brandProfileQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres du profil de marque invalides." },
      { status: 400 }
    );
  }

  try {
    const context = await requireOrganization(
      parsed.data.organizationId,
      undefined,
      request.headers
    );
    const brand = await requireTenantBrand(context.organizationId, parsed.data.brandId);
    const profile = await db.brandProfile.findFirst({
      where: {
        organizationId: context.organizationId,
        brandId: brand.id
      },
      select: profileSelection
    });

    return NextResponse.json(
      {
        brand,
        profile: profile ? profileDTO(profile, context.organizationId, brand.id) : null
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
    const parsed = brandProfilePatchSchema.safeParse(
      await readJsonWithLimit(request, MAX_BODY_BYTES)
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Profil de marque invalide." }, { status: 400 });
    }

    const context = await requireOrganization(
      parsed.data.organizationId,
      ["OWNER", "ADMIN", "EDITOR"],
      request.headers
    );
    const brand = await requireTenantBrand(context.organizationId, parsed.data.brandId);

    if (parsed.data.logoMediaAssetId) {
      const logo = await db.mediaAsset.findFirst({
        where: {
          id: parsed.data.logoMediaAssetId,
          organizationId: context.organizationId,
          brandId: brand.id
        },
        select: { id: true }
      });
      if (!logo) throw new AuthorizationError();
    }

    const existing = await db.brandProfile.findFirst({
      where: { organizationId: context.organizationId, brandId: brand.id },
      select: { id: true }
    });
    const profileData = {
      ...(parsed.data.logoMediaAssetId !== undefined
        ? { logoMediaAssetId: parsed.data.logoMediaAssetId }
        : {}),
      ...(parsed.data.slogan !== undefined ? { slogan: parsed.data.slogan } : {}),
      ...(parsed.data.story !== undefined ? { story: parsed.data.story } : {}),
      ...(parsed.data.cuisineType !== undefined ? { cuisineType: parsed.data.cuisineType } : {}),
      ...(parsed.data.positioning !== undefined ? { positioning: parsed.data.positioning } : {}),
      ...(parsed.data.targetAudience !== undefined
        ? { targetAudience: parsed.data.targetAudience }
        : {}),
      ...(parsed.data.geographicArea !== undefined
        ? { geographicArea: parsed.data.geographicArea }
        : {}),
      ...(parsed.data.priceRange !== undefined ? { priceRange: parsed.data.priceRange } : {}),
      ...(parsed.data.tones !== undefined ? { tones: parsed.data.tones } : {}),
      ...(parsed.data.colors !== undefined
        ? { colors: parsed.data.colors === null ? Prisma.DbNull : parsed.data.colors }
        : {}),
      ...(parsed.data.typography !== undefined
        ? { typography: parsed.data.typography === null ? Prisma.DbNull : parsed.data.typography }
        : {}),
      ...(parsed.data.allowedExpressions !== undefined
        ? { allowedExpressions: parsed.data.allowedExpressions }
        : {}),
      ...(parsed.data.wordsToAvoid !== undefined ? { wordsToAvoid: parsed.data.wordsToAvoid } : {}),
      ...(parsed.data.allowedEmojis !== undefined
        ? { allowedEmojis: parsed.data.allowedEmojis }
        : {}),
      ...(parsed.data.emojiUsageLevel !== undefined
        ? { emojiUsageLevel: parsed.data.emojiUsageLevel }
        : {}),
      ...(parsed.data.languages !== undefined ? { languages: parsed.data.languages } : {}),
      ...(parsed.data.orderLinks !== undefined
        ? { orderLinks: parsed.data.orderLinks === null ? Prisma.DbNull : parsed.data.orderLinks }
        : {}),
      ...(parsed.data.socialPlatforms !== undefined
        ? { socialPlatforms: parsed.data.socialPlatforms }
        : {}),
      ...(parsed.data.customInstruction !== undefined
        ? { customInstruction: parsed.data.customInstruction }
        : {})
    };
    const changedFields = [
      ...(parsed.data.logoMediaAssetId !== undefined ? ["logoMediaAssetId"] : []),
      ...(parsed.data.slogan !== undefined ? ["slogan"] : []),
      ...(parsed.data.story !== undefined ? ["story"] : []),
      ...(parsed.data.cuisineType !== undefined ? ["cuisineType"] : []),
      ...(parsed.data.positioning !== undefined ? ["positioning"] : []),
      ...(parsed.data.targetAudience !== undefined ? ["targetAudience"] : []),
      ...(parsed.data.geographicArea !== undefined ? ["geographicArea"] : []),
      ...(parsed.data.priceRange !== undefined ? ["priceRange"] : []),
      ...(parsed.data.tones !== undefined ? ["tones"] : []),
      ...(parsed.data.colors !== undefined ? ["colors"] : []),
      ...(parsed.data.typography !== undefined ? ["typography"] : []),
      ...(parsed.data.allowedExpressions !== undefined ? ["allowedExpressions"] : []),
      ...(parsed.data.wordsToAvoid !== undefined ? ["wordsToAvoid"] : []),
      ...(parsed.data.allowedEmojis !== undefined ? ["allowedEmojis"] : []),
      ...(parsed.data.emojiUsageLevel !== undefined ? ["emojiUsageLevel"] : []),
      ...(parsed.data.languages !== undefined ? ["languages"] : []),
      ...(parsed.data.orderLinks !== undefined ? ["orderLinks"] : []),
      ...(parsed.data.socialPlatforms !== undefined ? ["socialPlatforms"] : []),
      ...(parsed.data.customInstruction !== undefined ? ["customInstruction"] : [])
    ];

    const profile = await db.$transaction(async (transaction) => {
      const saved = await transaction.brandProfile.upsert({
        where: { brandId: brand.id },
        update: profileData,
        create: {
          organizationId: context.organizationId,
          brandId: brand.id,
          ...profileData
        },
        select: profileSelection
      });

      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: existing ? "UPDATE" : "CREATE",
          entityType: "BrandProfile",
          entityId: saved.id,
          metadata: { changedFields }
        }
      });

      return saved;
    });

    return NextResponse.json(
      { profile: profileDTO(profile, context.organizationId, brand.id) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
