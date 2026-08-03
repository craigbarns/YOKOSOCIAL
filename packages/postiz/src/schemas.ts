import { z } from "zod";

export const POSTIZ_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/tiff",
  "video/mp4"
] as const;

export const postizAllowedMimeTypeSchema = z.enum(POSTIZ_ALLOWED_MIME_TYPES);
export type PostizAllowedMimeType = z.infer<typeof postizAllowedMimeTypeSchema>;

export const postizTargetIdentifierSchema = z.enum([
  "facebook",
  "instagram",
  "instagram-standalone"
]);
export type PostizTargetIdentifier = z.infer<typeof postizTargetIdentifierSchema>;

export const postizPostFormatSchema = z.enum(["image", "carousel", "story", "reel"]);
export type PostizPostFormat = z.infer<typeof postizPostFormatSchema>;

const dateInputSchema = z.union([z.date(), z.iso.datetime({ offset: true })]);
export type PostizDateInput = z.infer<typeof dateInputSchema>;

export const uploadedMediaReferenceSchema = z.object({
  id: z.string().trim().min(1),
  path: z.url(),
  contentType: postizAllowedMimeTypeSchema
});
export type UploadedMediaReference = z.infer<typeof uploadedMediaReferenceSchema>;

export const uploadMediaInputSchema = z
  .object({
    file: z.custom<Blob>((value) => typeof Blob !== "undefined" && value instanceof Blob, {
      message: "Le média doit être fourni sous forme de Blob."
    }),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[\\/\0]/u.test(value), "Le nom de fichier est invalide."),
    contentType: postizAllowedMimeTypeSchema
  })
  .superRefine((input, context) => {
    if (input.file.size === 0) {
      context.addIssue({ code: "custom", path: ["file"], message: "Le fichier est vide." });
    }
    if (input.file.type && input.file.type !== input.contentType) {
      context.addIssue({
        code: "custom",
        path: ["contentType"],
        message: "Le type MIME déclaré ne correspond pas au type du Blob."
      });
    }
  });
export type UploadMediaInput = z.infer<typeof uploadMediaInputSchema>;

export const schedulePostInputSchema = z
  .object({
    integrationId: z.string().trim().min(1),
    identifier: postizTargetIdentifierSchema,
    content: z.string().max(5_000),
    format: postizPostFormatSchema,
    media: z.array(uploadedMediaReferenceSchema).max(20),
    scheduledAt: dateInputSchema,
    shortLink: z.boolean().optional(),
    linkUrl: z.url().optional()
  })
  .superRefine((input, context) => {
    const mediaCount = input.media.length;
    if (input.format === "image" && mediaCount !== 1) {
      context.addIssue({
        code: "custom",
        path: ["media"],
        message: "Une publication image doit contenir exactement un média."
      });
    }
    if (input.format === "carousel" && mediaCount < 2) {
      context.addIssue({
        code: "custom",
        path: ["media"],
        message: "Un carrousel doit contenir au moins deux médias."
      });
    }
    if ((input.format === "story" || input.format === "reel") && mediaCount !== 1) {
      context.addIssue({
        code: "custom",
        path: ["media"],
        message: "Une Story ou un Reel doit être envoyé séparément avec un seul média."
      });
    }
    if (
      (input.format === "image" || input.format === "carousel") &&
      input.media.some((media) => !media.contentType.startsWith("image/"))
    ) {
      context.addIssue({
        code: "custom",
        path: ["media"],
        message: "Les publications image et carrousel acceptent uniquement des images."
      });
    }
    if (input.format === "reel" && input.media[0]?.contentType !== "video/mp4") {
      context.addIssue({
        code: "custom",
        path: ["media"],
        message: "Postiz documente uniquement les vidéos MP4 pour les Reels."
      });
    }
    if (input.identifier === "facebook" && (input.format === "story" || input.format === "reel")) {
      context.addIssue({
        code: "custom",
        path: ["format"],
        message: "La documentation publique Postiz ne garantit pas ce format pour Facebook."
      });
    }
    if (input.identifier !== "facebook" && input.content.length > 2_200) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "La légende Instagram dépasse 2 200 caractères."
      });
    }
    if (input.identifier !== "facebook" && input.linkUrl) {
      context.addIssue({
        code: "custom",
        path: ["linkUrl"],
        message: "Le paramètre de lien documenté est réservé à Facebook."
      });
    }
  });
export type SchedulePostInput = z.infer<typeof schedulePostInputSchema>;

export const listIntegrationsOptionsSchema = z.object({
  groupId: z.string().trim().min(1).optional()
});
export type ListIntegrationsOptions = z.infer<typeof listIntegrationsOptionsSchema>;

export const listPostsQuerySchema = z
  .object({
    startDate: dateInputSchema,
    endDate: dateInputSchema,
    customerId: z.string().trim().min(1).optional()
  })
  .superRefine((query, context) => {
    const start = query.startDate instanceof Date ? query.startDate : new Date(query.startDate);
    const end = query.endDate instanceof Date ? query.endDate : new Date(query.endDate);
    if (start.getTime() > end.getTime()) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "La date de fin doit être postérieure à la date de début."
      });
    }
  });
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;

export const getPostStatusInputSchema = z
  .object({
    remotePostId: z.string().trim().min(1),
    startDate: dateInputSchema,
    endDate: dateInputSchema
  })
  .superRefine((query, context) => {
    const start = query.startDate instanceof Date ? query.startDate : new Date(query.startDate);
    const end = query.endDate instanceof Date ? query.endDate : new Date(query.endDate);
    if (start.getTime() > end.getTime()) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "La date de fin doit être postérieure à la date de début."
      });
    }
  });
export type GetPostStatusInput = z.infer<typeof getPostStatusInputSchema>;

export const analyticsWindowSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export type AnalyticsWindow = z.infer<typeof analyticsWindowSchema>;

export const postizConnectionResponseSchema = z.object({ connected: z.boolean() }).passthrough();

const postizCustomerSchema = z
  .object({
    id: z.string(),
    name: z.string()
  })
  .passthrough();

export const postizIntegrationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    identifier: z.string().min(1),
    picture: z.string().nullable().optional(),
    disabled: z.boolean().optional(),
    profile: z.string().nullable().optional(),
    customer: postizCustomerSchema.nullable().optional()
  })
  .passthrough();
export const postizIntegrationsResponseSchema = z.array(postizIntegrationSchema);
export type PostizIntegration = z.infer<typeof postizIntegrationSchema>;

export const postizUploadResponseSchema = z
  .object({
    id: z.string().min(1),
    path: z.url(),
    name: z.string().optional(),
    organizationId: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional()
  })
  .passthrough();
export type PostizUploadResponse = z.infer<typeof postizUploadResponseSchema>;

export const postizCreatePostResponseSchema = z
  .array(
    z
      .object({
        postId: z.string().min(1),
        integration: z.string().min(1)
      })
      .passthrough()
  )
  .min(1);
export type PostizCreatePostResponse = z.infer<typeof postizCreatePostResponseSchema>;

const postizListedIntegrationSchema = z
  .object({
    id: z.string().min(1),
    providerIdentifier: z.string().min(1),
    name: z.string(),
    picture: z.string().nullable().optional()
  })
  .passthrough();

export const postizListedPostSchema = z
  .object({
    id: z.string().min(1),
    content: z.string(),
    publishDate: z.iso.datetime({ offset: true }),
    releaseURL: z.union([z.url(), z.literal(""), z.null()]).optional(),
    integration: postizListedIntegrationSchema
  })
  .passthrough();
export type PostizListedPost = z.infer<typeof postizListedPostSchema>;

export const postizListPostsResponseSchema = z
  .object({ posts: z.array(postizListedPostSchema) })
  .passthrough();
export type PostizListPostsResponse = z.infer<typeof postizListPostsResponseSchema>;

export const postizStatusResponseSchema = z
  .object({
    id: z.string().min(1),
    state: z.enum(["DRAFT", "QUEUE"])
  })
  .passthrough();

export const analyticsMetricSchema = z
  .object({
    label: z.string().min(1),
    data: z.array(
      z
        .object({
          total: z.union([z.string(), z.number()]).transform(String),
          date: z.string().min(1)
        })
        .passthrough()
    ),
    percentageChange: z.number().nullable().optional()
  })
  .passthrough();
export const analyticsResponseSchema = z.array(analyticsMetricSchema);
export type AnalyticsMetric = z.infer<typeof analyticsMetricSchema>;

export const postizNotificationSchema = z
  .object({
    id: z.string().min(1),
    content: z.string(),
    link: z.union([z.url(), z.null()]).optional(),
    createdAt: z.iso.datetime({ offset: true })
  })
  .passthrough();

export const postizNotificationsResponseSchema = z
  .object({
    notifications: z.array(postizNotificationSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    hasMore: z.boolean()
  })
  .passthrough();
export type PostizNotificationsResponse = z.infer<typeof postizNotificationsResponseSchema>;

export function toIsoString(value: PostizDateInput): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
