import { z } from "zod";

const optionalNullableString = z.string().nullable().optional();

const numericValueSchema = z
  .union([z.number(), z.string().regex(/^-?\d+(?:\.\d+)?$/)])
  .transform((value) => Number(value));

const integerValueSchema = numericValueSchema.pipe(z.number().int());

export const crawlerOptionsSchema = z.object({
  maxPages: z.number().int().min(1).max(500).default(40),
  maxFamilies: z.number().int().min(1).max(100).default(30),
  maxStylesheets: z.number().int().min(0).max(50).default(8),
  concurrency: z.number().int().min(1).max(5).default(2),
  delayMs: z.number().int().min(0).max(30_000).default(750),
  timeoutMs: z.number().int().min(250).max(120_000).default(15_000),
  retries: z.number().int().min(0).max(5).default(2),
  maxRedirects: z.number().int().min(0).max(10).default(3),
  maxResponseBytes: z.number().int().min(1_024).max(20_000_000).default(5_000_000),
  maxCssBytes: z.number().int().min(1_024).max(5_000_000).default(1_000_000),
  userAgent: z
    .string()
    .min(8)
    .max(200)
    .default("YokoSushiSocialAgent/0.1 (+website content importer)")
});

export const addressSchema = z
  .object({
    rue: optionalNullableString,
    ville: optionalNullableString,
    code_postal: optionalNullableString,
    pays: optionalNullableString,
    num_rue: optionalNullableString,
    designation: optionalNullableString,
    latitude: z.union([z.string(), z.number()]).nullable().optional(),
    longitude: z.union([z.string(), z.number()]).nullable().optional()
  })
  .passthrough();

export const boutiqueSchema = z
  .object({
    id: integerValueSchema,
    nom_boutique: z.string().min(1),
    tel: optionalNullableString,
    geo_area: optionalNullableString,
    updated_at: optionalNullableString,
    adresse: addressSchema.nullable().optional()
  })
  .passthrough();

export const boutiquesResponseSchema = z.object({
  model: z.array(boutiqueSchema)
});

export const componentSchema = z
  .object({
    id: integerValueSchema.optional(),
    lib_composant: z.string().min(1)
  })
  .passthrough();

export const productSchema = z
  .object({
    id: integerValueSchema,
    famille_id: integerValueSchema,
    designation: z.string().min(1),
    prix: numericValueSchema,
    description: optionalNullableString,
    piece: optionalNullableString,
    photo: optionalNullableString,
    cacher: z.union([z.boolean(), integerValueSchema]).default(false),
    deleted_at: optionalNullableString,
    updated_at: optionalNullableString,
    effective_prix_promo: numericValueSchema.nullable().optional(),
    offer_badges: z.array(z.string()).default([]),
    composants: z.array(componentSchema).default([])
  })
  .passthrough();

export const familySchema = z
  .object({
    id: integerValueSchema,
    lib_famille: z.string().min(1),
    titre: optionalNullableString,
    description: optionalNullableString,
    photo: optionalNullableString,
    index: integerValueSchema.nullable().optional(),
    updated_at: optionalNullableString
  })
  .passthrough();

export const familiesResponseSchema = z.object({
  model: z.array(familySchema)
});

export const familyDetailResponseSchema = z.object({
  model: familySchema.extend({
    produits: z.array(productSchema).default([])
  })
});

export type BoutiqueApi = z.infer<typeof boutiqueSchema>;
export type FamilyApi = z.infer<typeof familySchema>;
export type ProductApi = z.infer<typeof productSchema>;
