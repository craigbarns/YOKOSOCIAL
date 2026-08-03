import { z } from "zod";

export const platformSchema = z.enum(["instagram", "facebook"]);
export type Platform = z.infer<typeof platformSchema>;

export const postFormatSchema = z.enum(["image", "carousel", "story", "reel"]);
export type PostFormat = z.infer<typeof postFormatSchema>;

export const postTopicSchema = z.enum([
  "product",
  "platter",
  "restaurant",
  "ambiance",
  "promotion",
  "delivery",
  "behind_the_scenes",
  "team",
  "seasonal",
  "local"
]);

const storyFrameSchema = z.object({
  headline: z.string().min(1).max(90),
  body: z.string().max(180).optional(),
  mediaAssetId: z.string().min(1).optional()
});

const carouselSlideSchema = z.object({
  headline: z.string().min(1).max(120),
  body: z.string().max(240).optional(),
  mediaAssetId: z.string().min(1).optional()
});

export const generatedPostSchema = z
  .object({
    title: z.string().min(1).max(120),
    objective: z.string().min(1).max(240),
    establishmentIds: z.array(z.string().min(1)).max(30),
    platforms: z.array(platformSchema).min(1).max(2),
    format: postFormatSchema,
    topic: postTopicSchema,
    instagramCaption: z.string().max(2_200).optional(),
    facebookCaption: z.string().max(5_000).optional(),
    callToAction: z.string().min(1).max(180),
    hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]+$/u)).max(12),
    mediaAssetIds: z.array(z.string().min(1)).max(10),
    suggestedAt: z.iso.datetime({ offset: true }).optional(),
    reelScript: z.string().max(3_000).optional(),
    storyFrames: z.array(storyFrameSchema).max(10).optional(),
    carouselSlides: z.array(carouselSlideSchema).max(10).optional(),
    rationale: z.string().min(1).max(1_000),
    warnings: z.array(z.string().max(300)).max(20)
  })
  .superRefine((post, context) => {
    if (post.platforms.includes("instagram") && !post.instagramCaption) {
      context.addIssue({
        code: "custom",
        path: ["instagramCaption"],
        message: "Une légende Instagram est requise pour Instagram."
      });
    }
    if (post.platforms.includes("facebook") && !post.facebookCaption) {
      context.addIssue({
        code: "custom",
        path: ["facebookCaption"],
        message: "Une légende Facebook est requise pour Facebook."
      });
    }
    if (post.format === "reel" && !post.reelScript) {
      context.addIssue({
        code: "custom",
        path: ["reelScript"],
        message: "Un Reel doit contenir un script."
      });
    }
    if (post.format === "story" && !post.storyFrames?.length) {
      context.addIssue({
        code: "custom",
        path: ["storyFrames"],
        message: "Une Story doit contenir au moins un écran."
      });
    }
    if (post.format === "carousel" && (post.carouselSlides?.length ?? 0) < 2) {
      context.addIssue({
        code: "custom",
        path: ["carouselSlides"],
        message: "Un carrousel doit contenir au moins deux slides."
      });
    }
    if (post.format === "image" && post.mediaAssetIds.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["mediaAssetIds"],
        message: "Une publication image doit contenir exactement un média."
      });
    }
    if (
      post.format === "carousel" &&
      (post.mediaAssetIds.length < 2 || post.mediaAssetIds.length > 10)
    ) {
      context.addIssue({
        code: "custom",
        path: ["mediaAssetIds"],
        message: "Un carrousel doit contenir entre deux et dix médias."
      });
    }
    if ((post.format === "story" || post.format === "reel") && post.mediaAssetIds.length < 1) {
      context.addIssue({
        code: "custom",
        path: ["mediaAssetIds"],
        message: "Une Story ou un Reel doit proposer au moins un média."
      });
    }
  });

export type GeneratedPost = z.infer<typeof generatedPostSchema>;

export const importStatusSchema = z.enum([
  "PENDING",
  "CRAWLING",
  "ANALYZING",
  "WAITING_FOR_REVIEW",
  "IMPORTING",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "FAILED",
  "CANCELLED"
]);

export const importProgressStepSchema = z.enum([
  "CONNECTING",
  "SCANNING_PAGES",
  "DETECTING_ESTABLISHMENTS",
  "DETECTING_PRODUCTS",
  "DETECTING_IMAGES",
  "ANALYZING_QUALITY",
  "FINDING_DUPLICATES",
  "PREPARING_PREVIEW"
]);

export const mediaCategorySchema = z.enum([
  "LOGO",
  "PRODUCT",
  "PLATTER",
  "RESTAURANT",
  "AMBIANCE",
  "TEAM",
  "DELIVERY",
  "PROMOTION",
  "DECORATION",
  "TECHNICAL",
  "UNCLASSIFIED"
]);

export const mediaStatusSchema = z.enum([
  "APPROVED",
  "NEEDS_REVIEW",
  "LOW_QUALITY",
  "REJECTED",
  "ARCHIVED",
  "SOURCE_NOT_FOUND"
]);

export const socialPostStatusSchema = z.enum([
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "REJECTED",
  "FAILED",
  "CANCELLED"
]);
export type SocialPostStatus = z.infer<typeof socialPostStatusSchema>;

export const confidenceSchema = z.number().min(0).max(1);

export const sourceClaimSchema = z.object({
  field: z.string().min(1),
  value: z.unknown(),
  sourceUrl: z.url(),
  retrievedAt: z.iso.datetime({ offset: true }),
  confidence: confidenceSchema,
  validationStatus: z.enum(["PENDING", "VALIDATED", "REJECTED"]),
  sourceModifiedAt: z.iso.datetime({ offset: true }).optional()
});

export type SourceClaim = z.infer<typeof sourceClaimSchema>;

export const organizationContextSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(["OWNER", "ADMIN", "EDITOR", "REVIEWER", "VIEWER"])
});
export type OrganizationContext = z.infer<typeof organizationContextSchema>;

export const contentCampaignGenerationConfigSchema = z
  .object({
    establishmentIds: z.array(z.string().min(1)).max(30),
    platforms: z.array(platformSchema).min(1).max(2),
    count: z.number().int().min(1).max(30),
    startDate: z.iso.datetime({ offset: true }),
    preferredTopics: z.array(postTopicSchema).max(10).default([])
  })
  .strict();

export type ContentCampaignGenerationConfig = z.infer<typeof contentCampaignGenerationConfigSchema>;

export const safeErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional()
});
