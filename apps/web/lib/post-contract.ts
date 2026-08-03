import { z } from "zod";

import {
  platformSchema,
  postFormatSchema,
  postTopicSchema,
  socialPostStatusSchema
} from "@yokosocial/shared";

const nullableCaptionSchema = z.string().trim().max(5_000).nullable();

export const postListQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  brandId: z.string().trim().min(1),
  status: socialPostStatusSchema.optional()
});

export const updatePostSchema = z
  .object({
    organizationId: z.string().trim().min(1),
    title: z.string().trim().min(1).max(120),
    objective: z.string().trim().min(1).max(240),
    platforms: z.array(platformSchema).min(1).max(2),
    format: postFormatSchema,
    topic: postTopicSchema,
    instagramCaption: nullableCaptionSchema,
    facebookCaption: nullableCaptionSchema,
    callToAction: z.string().trim().min(1).max(180),
    hashtags: z
      .array(
        z
          .string()
          .trim()
          .regex(/^#[\p{L}\p{N}_]+$/u)
      )
      .max(12),
    establishmentIds: z.array(z.string().trim().min(1)).max(30),
    mediaAssetIds: z.array(z.string().trim().min(1)).max(20),
    scheduledAt: z.iso.datetime({ offset: true }).nullable(),
    internalNote: z.string().trim().max(2_000).nullable().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.platforms).size !== value.platforms.length) {
      context.addIssue({
        code: "custom",
        path: ["platforms"],
        message: "Un réseau ne peut être sélectionné qu’une fois."
      });
    }
    if (new Set(value.establishmentIds).size !== value.establishmentIds.length) {
      context.addIssue({
        code: "custom",
        path: ["establishmentIds"],
        message: "Un établissement ne peut être sélectionné qu’une fois."
      });
    }
    if (new Set(value.mediaAssetIds).size !== value.mediaAssetIds.length) {
      context.addIssue({
        code: "custom",
        path: ["mediaAssetIds"],
        message: "Un média ne peut être sélectionné qu’une fois."
      });
    }
    if (value.platforms.includes("instagram") && !value.instagramCaption) {
      context.addIssue({
        code: "custom",
        path: ["instagramCaption"],
        message: "La légende Instagram est requise."
      });
    }
    if (value.platforms.includes("facebook") && !value.facebookCaption) {
      context.addIssue({
        code: "custom",
        path: ["facebookCaption"],
        message: "La légende Facebook est requise."
      });
    }
    const mediaCount = value.mediaAssetIds.length;
    if (value.format === "image" && mediaCount !== 1) {
      context.addIssue({
        code: "custom",
        path: ["mediaAssetIds"],
        message: "Une publication image doit utiliser exactement une photo validée."
      });
    }
    if (value.format === "carousel" && (mediaCount < 2 || mediaCount > 10)) {
      context.addIssue({
        code: "custom",
        path: ["mediaAssetIds"],
        message: "Un carrousel doit contenir entre 2 et 10 photos."
      });
    }
    if ((value.format === "story" || value.format === "reel") && mediaCount < 1) {
      context.addIssue({
        code: "custom",
        path: ["mediaAssetIds"],
        message: "Ce format doit référencer au moins un média."
      });
    }
  });

export const postTransitionSchema = z
  .object({
    organizationId: z.string().trim().min(1),
    action: z.enum(["submit", "approve", "reject", "reopen", "cancel"]),
    reason: z
      .enum([
        "TEXT_TOO_LONG",
        "TEXT_TOO_GENERIC",
        "WRONG_PHOTO",
        "WRONG_PRODUCT",
        "WRONG_INFORMATION",
        "WRONG_DATE",
        "WRONG_TONE",
        "OTHER"
      ])
      .optional(),
    note: z.string().trim().max(2_000).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === "reject" && value.note === "") {
      context.addIssue({ code: "custom", path: ["note"], message: "La note est vide." });
    }
    if (value.action !== "reject" && (value.reason || value.note)) {
      context.addIssue({
        code: "custom",
        path: ["action"],
        message: "Le motif et la note sont réservés au refus."
      });
    }
  });

export const schedulePostSchema = z
  .object({
    organizationId: z.string().trim().min(1),
    scheduledAt: z.iso.datetime({ offset: true }),
    socialAccountIds: z.array(z.string().trim().min(1)).min(1).max(2)
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.socialAccountIds).size !== value.socialAccountIds.length) {
      context.addIssue({
        code: "custom",
        path: ["socialAccountIds"],
        message: "Un compte social ne peut être sélectionné qu’une fois."
      });
    }
  });

export type UpdatePostInput = z.infer<typeof updatePostSchema>;
