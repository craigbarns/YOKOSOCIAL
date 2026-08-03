import { db, type Prisma } from "@yokosocial/database";
import { NextResponse } from "next/server";

import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import { requireOrganization, requireTrustedMutationOrigin } from "@/lib/authorization";
import { updatePostSchema, type UpdatePostInput } from "@/lib/post-contract";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 128 * 1024;

function platform(value: "instagram" | "facebook"): "INSTAGRAM" | "FACEBOOK" {
  return value === "instagram" ? "INSTAGRAM" : "FACEBOOK";
}

const formats = {
  image: "IMAGE",
  carousel: "CAROUSEL",
  story: "STORY",
  reel: "REEL"
} as const;

const topics = {
  product: "PRODUCT",
  platter: "PLATTER",
  restaurant: "RESTAURANT",
  ambiance: "AMBIANCE",
  promotion: "PROMOTION",
  delivery: "DELIVERY",
  behind_the_scenes: "BEHIND_THE_SCENES",
  team: "TEAM",
  seasonal: "SEASONAL",
  local: "LOCAL"
} as const;

function snapshot(input: UpdatePostInput): Prisma.InputJsonValue {
  return {
    title: input.title,
    objective: input.objective,
    platforms: input.platforms,
    format: input.format,
    topic: input.topic,
    instagramCaption: input.instagramCaption,
    facebookCaption: input.facebookCaption,
    callToAction: input.callToAction,
    hashtags: input.hashtags,
    establishmentIds: input.establishmentIds,
    mediaAssetIds: input.mediaAssetIds,
    scheduledAt: input.scheduledAt
  };
}

export async function GET(request: Request, context: { params: Promise<{ postId: string }> }) {
  const organizationId = new URL(request.url).searchParams.get("organizationId")?.trim();
  if (!organizationId) {
    return NextResponse.json({ error: "Organisation manquante." }, { status: 400 });
  }

  try {
    await requireOrganization(organizationId, undefined, request.headers);
    const { postId } = await context.params;
    const post = await db.socialPost.findFirst({
      where: { id: postId, organizationId },
      include: {
        establishmentLinks: { include: { establishment: true }, orderBy: { createdAt: "asc" } },
        media: {
          include: { mediaAsset: true, mediaVariant: true },
          orderBy: { sortOrder: "asc" }
        },
        versions: { orderBy: { versionNumber: "desc" }, take: 20 },
        publicationJobs: {
          include: {
            socialAccount: {
              select: { id: true, platform: true, displayName: true, username: true }
            },
            attempts: { orderBy: { attemptNumber: "desc" }, take: 10 }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });
    if (!post) return NextResponse.json({ error: "Publication introuvable." }, { status: 404 });

    return NextResponse.json({
      post: {
        ...post,
        media: post.media.map((item) => ({
          ...item,
          mediaAsset: {
            ...item.mediaAsset,
            byteSize: item.mediaAsset.byteSize?.toString() ?? null
          },
          mediaVariant: item.mediaVariant
            ? {
                ...item.mediaVariant,
                byteSize: item.mediaVariant.byteSize?.toString() ?? null
              }
            : null
        }))
      }
    });
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ postId: string }> }) {
  try {
    requireTrustedMutationOrigin(request);
    const parsed = updatePostSchema.safeParse(await readJsonWithLimit(request, MAX_BODY_BYTES));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Contenu de publication invalide.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const authorization = await requireOrganization(
      parsed.data.organizationId,
      ["OWNER", "ADMIN", "EDITOR"],
      request.headers
    );
    const { postId } = await context.params;
    const result = await db.$transaction(async (transaction) => {
      const current = await transaction.socialPost.findFirst({
        where: { id: postId, organizationId: authorization.organizationId },
        select: {
          id: true,
          brandId: true,
          status: true,
          currentVersionNumber: true
        }
      });
      if (!current) return { kind: "missing" as const };
      if (
        ["SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED", "CANCELLED"].includes(current.status)
      ) {
        return { kind: "locked" as const, status: current.status };
      }

      const [establishmentCount, media] = await Promise.all([
        transaction.establishment.count({
          where: {
            organizationId: authorization.organizationId,
            brandId: current.brandId,
            id: { in: parsed.data.establishmentIds },
            status: "ACTIVE",
            validationStatus: "APPROVED"
          }
        }),
        transaction.mediaAsset.findMany({
          where: {
            organizationId: authorization.organizationId,
            brandId: current.brandId,
            id: { in: parsed.data.mediaAssetIds },
            status: "APPROVED",
            publicUrl: { not: null }
          },
          select: { id: true }
        })
      ]);
      if (establishmentCount !== parsed.data.establishmentIds.length) {
        return { kind: "invalid-establishments" as const };
      }
      if (media.length !== parsed.data.mediaAssetIds.length) {
        return { kind: "invalid-media" as const };
      }

      const nextVersion = current.currentVersionNumber + 1;
      await transaction.socialPostEstablishment.deleteMany({
        where: { socialPostId: current.id, organizationId: authorization.organizationId }
      });
      await transaction.socialPostMedia.deleteMany({
        where: { socialPostId: current.id, organizationId: authorization.organizationId }
      });
      const updated = await transaction.socialPost.update({
        where: { id: current.id },
        data: {
          title: parsed.data.title,
          objective: parsed.data.objective,
          platforms: parsed.data.platforms.map(platform),
          format: formats[parsed.data.format],
          topic: topics[parsed.data.topic],
          instagramCaption: parsed.data.instagramCaption,
          facebookCaption: parsed.data.facebookCaption,
          callToAction: parsed.data.callToAction,
          hashtags: parsed.data.hashtags,
          scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
          audienceScope:
            parsed.data.establishmentIds.length > 0 ? "SELECTED_ESTABLISHMENTS" : "BRAND",
          status: "DRAFT",
          currentVersionNumber: nextVersion,
          approvedById: null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null,
          rejectionNote: null,
          establishmentLinks: {
            create: parsed.data.establishmentIds.map((establishmentId) => ({
              organizationId: authorization.organizationId,
              establishmentId
            }))
          },
          media: {
            create: parsed.data.mediaAssetIds.map((mediaAssetId, sortOrder) => ({
              organizationId: authorization.organizationId,
              mediaAssetId,
              sortOrder,
              role: sortOrder === 0 ? "PRIMARY" : "CAROUSEL_SLIDE"
            }))
          },
          versions: {
            create: {
              organizationId: authorization.organizationId,
              createdById: authorization.userId,
              versionNumber: nextVersion,
              origin: "MANUAL",
              content: snapshot(parsed.data),
              internalNote: parsed.data.internalNote || null
            }
          }
        },
        select: { id: true, status: true, currentVersionNumber: true, updatedAt: true }
      });
      await transaction.auditLog.create({
        data: {
          organizationId: authorization.organizationId,
          actorUserId: authorization.userId,
          action: "UPDATE",
          entityType: "SocialPost",
          entityId: current.id,
          metadata: { versionNumber: nextVersion, previousStatus: current.status }
        }
      });
      return { kind: "updated" as const, post: updated };
    });

    if (result.kind === "missing") {
      return NextResponse.json({ error: "Publication introuvable." }, { status: 404 });
    }
    if (result.kind === "locked") {
      return NextResponse.json(
        { error: "Cette publication n’est plus modifiable dans cet état.", status: result.status },
        { status: 409 }
      );
    }
    if (result.kind === "invalid-establishments") {
      return NextResponse.json(
        { error: "Tous les établissements doivent être actifs et validés." },
        { status: 409 }
      );
    }
    if (result.kind === "invalid-media") {
      return NextResponse.json(
        { error: "Tous les médias doivent être validés et copiés dans la médiathèque." },
        { status: 409 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
