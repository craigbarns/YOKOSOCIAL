import {
  ContentGenerationService,
  repetitionScore,
  type ContentGenerationProvider,
  type GenerationRequest
} from "@yokosocial/ai";
import { db, type Prisma } from "@yokosocial/database";
import {
  contentCampaignGenerationConfigSchema,
  type GeneratedPost,
  type TenantJobPayload
} from "@yokosocial/shared";

function platform(value: "instagram" | "facebook"): "INSTAGRAM" | "FACEBOOK" {
  return value === "instagram" ? "INSTAGRAM" : "FACEBOOK";
}

const formats = {
  image: "IMAGE",
  carousel: "CAROUSEL",
  story: "STORY",
  reel: "REEL"
} as const satisfies Record<GeneratedPost["format"], string>;

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
} as const satisfies Record<GeneratedPost["topic"], string>;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function joinedAddress(establishment: {
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
}): string | undefined {
  const value = [establishment.addressLine1, establishment.postalCode, establishment.city]
    .filter((part): part is string => Boolean(part))
    .join(", ");
  return value || undefined;
}

export type ContentGenerationOutcome = {
  campaignId: string;
  status: "COMPLETED" | "ALREADY_PROCESSED" | "ALREADY_RUNNING";
  postsCreated: number;
  provider: string;
};

export class ContentGenerationProcessor {
  constructor(private readonly provider: ContentGenerationProvider) {}

  async execute(payload: TenantJobPayload): Promise<ContentGenerationOutcome> {
    const campaign = await db.contentCampaign.findFirst({
      where: { id: payload.resourceId, organizationId: payload.organizationId },
      include: {
        brand: { include: { profile: true } },
        establishmentLinks: { include: { establishment: true } }
      }
    });
    if (!campaign) throw new Error("Campagne de génération introuvable pour cette organisation.");
    if (campaign.status === "COMPLETED") {
      return {
        campaignId: campaign.id,
        status: "ALREADY_PROCESSED",
        postsCreated: 0,
        provider: this.provider.name
      };
    }

    const claimed = await db.contentCampaign.updateMany({
      where: {
        id: campaign.id,
        organizationId: payload.organizationId,
        status: "DRAFT"
      },
      data: { status: "ACTIVE" }
    });
    if (claimed.count !== 1) {
      return {
        campaignId: campaign.id,
        status: "ALREADY_RUNNING",
        postsCreated: 0,
        provider: this.provider.name
      };
    }

    try {
      const config = contentCampaignGenerationConfigSchema.parse(campaign.generationConfig);
      const selectedIds = new Set(config.establishmentIds);
      const establishments = campaign.establishmentLinks
        .map((link) => link.establishment)
        .filter(
          (item) =>
            selectedIds.has(item.id) &&
            item.status === "ACTIVE" &&
            item.validationStatus === "APPROVED"
        );
      if (establishments.length !== selectedIds.size) {
        throw new Error("Un établissement sélectionné n’est plus validé.");
      }

      const [products, media, previousPosts, feedback] = await Promise.all([
        db.menuItem.findMany({
          where: {
            organizationId: payload.organizationId,
            brandId: campaign.brandId,
            validationStatus: "APPROVED",
            status: "ACTIVE"
          },
          include: {
            category: { select: { name: true } },
            establishmentLinks: {
              where: { validationStatus: "APPROVED", available: true },
              select: { establishmentId: true }
            }
          },
          orderBy: { updatedAt: "desc" },
          take: 100
        }),
        db.mediaAsset.findMany({
          where: {
            organizationId: payload.organizationId,
            brandId: campaign.brandId,
            status: "APPROVED"
          },
          include: {
            establishmentLinks: {
              where: { validated: true },
              select: { establishmentId: true }
            }
          },
          orderBy: [{ qualityScore: "desc" }, { usageCount: "asc" }],
          take: 100
        }),
        db.socialPost.findMany({
          where: { organizationId: payload.organizationId, brandId: campaign.brandId },
          include: { media: { select: { mediaAssetId: true } } },
          orderBy: { createdAt: "desc" },
          take: 20
        }),
        db.userFeedback.findMany({
          where: { organizationId: payload.organizationId, message: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { message: true },
          take: 20
        })
      ]);
      if (products.length === 0 || media.length === 0) {
        throw new Error("Aucun produit ou média validé n’est disponible pour la génération.");
      }

      const request: GenerationRequest = {
        organizationId: payload.organizationId,
        brand: {
          id: campaign.brand.id,
          name: campaign.brand.name,
          tone: campaign.brand.profile?.tones.map((toneValue) => toneValue.toLowerCase()) ?? [],
          guidelines:
            campaign.brand.profile?.customInstruction ??
            "Ton moderne, gourmand et direct. Ne jamais inventer d’information.",
          forbiddenPhrases: campaign.brand.profile?.wordsToAvoid ?? [],
          languages: campaign.brand.profile?.languages ?? ["fr"]
        },
        establishments: establishments.map((item) => {
          const address = joinedAddress(item);
          return {
            id: item.id,
            name: item.name,
            ...(item.city ? { city: item.city } : {}),
            ...(address ? { address } : {}),
            ...(item.phone ? { phone: item.phone } : {}),
            ...(item.services.length ? { services: item.services } : {}),
            validatedFields: [
              "name",
              ...(item.addressLine1 ? ["address"] : []),
              ...(item.phone ? ["phone"] : []),
              ...(item.businessHours ? ["openingHours"] : []),
              ...(item.services.length ? ["services"] : [])
            ]
          };
        }),
        products: products.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category?.name ?? "Non classé",
          ...(item.description ? { description: item.description } : {}),
          price: item.price ? `${item.price.toString()} ${item.currency}` : null,
          establishmentIds: item.establishmentLinks.map((link) => link.establishmentId),
          validated: true
        })),
        media: media.map((item) => ({
          id: item.id,
          title: item.detectedTitle ?? item.altText ?? item.originalName,
          category: item.editorialCategory,
          qualityScore: item.qualityScore,
          status: item.status,
          establishmentIds: item.establishmentLinks.map((link) => link.establishmentId),
          ...(item.menuItemId ? { productId: item.menuItemId } : {}),
          usageCount: item.usageCount
        })),
        platforms: config.platforms,
        establishmentIds: config.establishmentIds,
        count: config.count,
        startDate: config.startDate,
        preferredTopics: config.preferredTopics,
        previousPosts: previousPosts.map((post) => ({
          topic: post.topic.toLowerCase() as GeneratedPost["topic"],
          callToAction: post.callToAction,
          mediaAssetIds: post.media.map((item) => item.mediaAssetId)
        })),
        feedback: feedback.flatMap((item) => (item.message ? [item.message] : [])),
        demoMode: false
      };
      const generated = await new ContentGenerationService(this.provider).generate(request);
      const allowedMedia = new Set(media.map((item) => item.id));

      await db.$transaction(async (transaction) => {
        const stillActive = await transaction.contentCampaign.findFirst({
          where: {
            id: campaign.id,
            organizationId: payload.organizationId,
            status: "ACTIVE"
          },
          select: { id: true }
        });
        if (!stillActive) throw new Error("La campagne n’est plus active.");

        const generatedCaptions: string[] = [];
        for (const post of generated.posts) {
          const caption = [post.instagramCaption, post.facebookCaption].filter(Boolean).join(" ");
          const repetition = Math.max(
            0,
            ...previousPosts.map((previous) =>
              repetitionScore(
                caption,
                [previous.instagramCaption, previous.facebookCaption].filter(Boolean).join(" ")
              )
            ),
            ...generatedCaptions.map((previousCaption) => repetitionScore(caption, previousCaption))
          );
          generatedCaptions.push(caption);
          const idea = await transaction.contentIdea.create({
            data: {
              organizationId: payload.organizationId,
              brandId: campaign.brandId,
              contentCampaignId: campaign.id,
              title: post.title,
              objective: post.objective,
              platforms: post.platforms.map(platform),
              format: formats[post.format],
              topic: topics[post.topic],
              rationale: post.rationale,
              warnings: post.warnings,
              ...(post.suggestedAt ? { suggestedAt: new Date(post.suggestedAt) } : {}),
              repetitionScore: repetition,
              generatedBy: this.provider.name,
              generationPayload: json({
                provider: this.provider.name,
                rejectedCount: generated.rejectedCount
              }),
              establishmentLinks: {
                create: post.establishmentIds.map((establishmentId) => ({
                  organizationId: payload.organizationId,
                  establishmentId
                }))
              }
            }
          });
          await transaction.socialPost.create({
            data: {
              organizationId: payload.organizationId,
              brandId: campaign.brandId,
              contentCampaignId: campaign.id,
              contentIdeaId: idea.id,
              createdById: payload.actorId,
              title: post.title,
              objective: post.objective,
              audienceScope: post.establishmentIds.length > 0 ? "SELECTED_ESTABLISHMENTS" : "BRAND",
              platforms: post.platforms.map(platform),
              format: formats[post.format],
              topic: topics[post.topic],
              instagramCaption: post.instagramCaption ?? null,
              facebookCaption: post.facebookCaption ?? null,
              callToAction: post.callToAction,
              hashtags: post.hashtags,
              reelScript: post.reelScript ?? null,
              ...(post.storyFrames ? { storyFrames: json(post.storyFrames) } : {}),
              ...(post.carouselSlides ? { carouselSlides: json(post.carouselSlides) } : {}),
              rationale: post.rationale,
              warnings: post.warnings,
              repetitionScore: repetition,
              status: "DRAFT",
              ...(post.suggestedAt ? { scheduledAt: new Date(post.suggestedAt) } : {}),
              establishmentLinks: {
                create: post.establishmentIds.map((establishmentId) => ({
                  organizationId: payload.organizationId,
                  establishmentId
                }))
              },
              media: {
                create: post.mediaAssetIds
                  .filter((mediaAssetId) => allowedMedia.has(mediaAssetId))
                  .map((mediaAssetId, sortOrder) => ({
                    organizationId: payload.organizationId,
                    mediaAssetId,
                    sortOrder,
                    role: sortOrder === 0 ? "PRIMARY" : "CAROUSEL_SLIDE"
                  }))
              },
              versions: {
                create: {
                  organizationId: payload.organizationId,
                  createdById: payload.actorId,
                  versionNumber: 1,
                  origin: "AI",
                  content: json(post)
                }
              }
            }
          });
        }
        await transaction.contentCampaign.update({
          where: { id: campaign.id },
          data: { status: "COMPLETED", endsAt: new Date() }
        });
        await transaction.auditLog.create({
          data: {
            organizationId: payload.organizationId,
            actorUserId: payload.actorId,
            action: "CREATE",
            entityType: "SocialPostBatch",
            entityId: campaign.id,
            metadata: { count: generated.posts.length, provider: this.provider.name }
          }
        });
      });

      return {
        campaignId: campaign.id,
        status: "COMPLETED",
        postsCreated: generated.posts.length,
        provider: this.provider.name
      };
    } catch (error) {
      await db.contentCampaign.updateMany({
        where: { id: campaign.id, organizationId: payload.organizationId, status: "ACTIVE" },
        data: { status: "DRAFT" }
      });
      throw error;
    }
  }
}
