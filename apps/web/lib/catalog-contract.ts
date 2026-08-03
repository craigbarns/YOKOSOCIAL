import { z } from "zod";

const MAX_ESTABLISHMENTS = 50;

const mediaStatuses = [
  "APPROVED",
  "NEEDS_REVIEW",
  "LOW_QUALITY",
  "REJECTED",
  "ARCHIVED",
  "SOURCE_NOT_FOUND"
] as const;

const mediaCategories = [
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
] as const;

const editorialCategories = [
  "SUSHI",
  "MAKI",
  "CALIFORNIA",
  "SASHIMI",
  "NIGIRI",
  "POKE",
  "PLATTER",
  "MENU",
  "DESSERT",
  "DRINK",
  "RESTAURANT",
  "TERRACE",
  "AMBIANCE",
  "TEAM",
  "DELIVERY",
  "LOGO",
  "PROMOTION",
  "UNCLASSIFIED"
] as const;

const menuItemStatuses = [
  "DRAFT",
  "ACTIVE",
  "UNAVAILABLE",
  "NEEDS_REVIEW",
  "ARCHIVED",
  "SOURCE_NOT_FOUND"
] as const;

const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");

export const mediaListQuerySchema = z.object({
  organizationId: z.string().trim().min(1).max(100),
  brandId: z.string().trim().min(1).max(100),
  status: z.enum(mediaStatuses).optional(),
  category: z.enum(mediaCategories).optional(),
  search: z.string().trim().min(1).max(150).optional(),
  establishmentId: z.string().trim().min(1).max(100).optional(),
  neverUsed: booleanQuery.optional(),
  bestInstagram: booleanQuery.optional(),
  review: booleanQuery.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(48)
});

export const mediaPatchSchema = z
  .object({
    organizationId: z.string().trim().min(1).max(100),
    brandId: z.string().trim().min(1).max(100),
    mediaAssetId: z.string().trim().min(1).max(100),
    category: z.enum(mediaCategories).optional(),
    editorialCategory: z.enum(editorialCategories).optional(),
    status: z.enum(mediaStatuses).optional(),
    establishmentIds: z
      .array(z.string().trim().min(1).max(100))
      .max(MAX_ESTABLISHMENTS)
      .refine((ids) => new Set(ids).size === ids.length, "Établissements dupliqués.")
      .optional()
  })
  .refine(
    (data) =>
      data.category !== undefined ||
      data.editorialCategory !== undefined ||
      data.status !== undefined ||
      data.establishmentIds !== undefined,
    "Aucune correction fournie."
  );

export const productListQuerySchema = z.object({
  organizationId: z.string().trim().min(1).max(100),
  brandId: z.string().trim().min(1).max(100),
  categoryId: z.string().trim().min(1).max(100).optional(),
  status: z.enum(menuItemStatuses).optional(),
  search: z.string().trim().min(1).max(150).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const priceSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/, "Prix décimal invalide.");

export const productPatchSchema = z
  .object({
    organizationId: z.string().trim().min(1).max(100),
    brandId: z.string().trim().min(1).max(100),
    menuItemId: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5_000).nullable().optional(),
    categoryId: z.string().trim().min(1).max(100).nullable().optional(),
    price: priceSchema.nullable().optional(),
    priceConfirmed: z.literal(true).optional(),
    establishmentIds: z
      .array(z.string().trim().min(1).max(100))
      .max(MAX_ESTABLISHMENTS)
      .refine((ids) => new Set(ids).size === ids.length, "Établissements dupliqués.")
      .optional()
  })
  .superRefine((data, context) => {
    const hasChange =
      data.name !== undefined ||
      data.description !== undefined ||
      data.categoryId !== undefined ||
      data.price !== undefined ||
      data.establishmentIds !== undefined;

    if (!hasChange) {
      context.addIssue({ code: "custom", message: "Aucune correction fournie." });
    }
    if (data.price !== undefined && data.priceConfirmed !== true) {
      context.addIssue({
        code: "custom",
        path: ["priceConfirmed"],
        message: "Le prix doit être explicitement confirmé."
      });
    }
  });
