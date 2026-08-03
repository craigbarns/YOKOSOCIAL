import { z } from "zod";

const organizationTarget = {
  organizationId: z.string().trim().min(1).max(100),
  brandId: z.string().trim().min(1).max(100)
};

const httpUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .url()
  .refine((value) => {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.username &&
      !parsed.password
    );
  }, "Le lien doit utiliser HTTP ou HTTPS, sans identifiants intégrés.");

const nullableHttpUrlSchema = httpUrlSchema.nullable();
const nullableShortText = (maximum: number) => z.string().trim().max(maximum).nullable();
const uniqueTextArray = (maximumItems: number, maximumLength: number) =>
  z
    .array(z.string().trim().min(1).max(maximumLength))
    .max(maximumItems)
    .refine((items) => new Set(items).size === items.length, "Les valeurs doivent être uniques.");

const jsonObjectSchema = z
  .record(z.string().trim().min(1).max(100), z.json())
  .refine((value) => Object.keys(value).length <= 100, "Objet trop volumineux.");

const orderLinksSchema = z
  .record(z.string().trim().min(1).max(100), httpUrlSchema)
  .refine((value) => Object.keys(value).length <= 30, "Trop de liens de commande.");

export const establishmentListQuerySchema = z.object({
  organizationId: organizationTarget.organizationId,
  brandId: organizationTarget.brandId.optional()
});

export const establishmentCreateSchema = z.object({
  ...organizationTarget,
  name: z.string().trim().min(2).max(150),
  city: z.string().trim().max(100).optional()
});

export const establishmentPatchSchema = z
  .object({
    ...organizationTarget,
    establishmentId: z.string().trim().min(1).max(100),
    name: z.string().trim().min(2).max(150).optional(),
    addressLine1: nullableShortText(250).optional(),
    addressLine2: nullableShortText(250).optional(),
    postalCode: nullableShortText(20).optional(),
    city: nullableShortText(100).optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
    phone: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[+0-9().\s-]+$/, "Numéro de téléphone invalide.")
      .nullable()
      .optional(),
    businessHours: jsonObjectSchema.nullable().optional(),
    services: uniqueTextArray(50, 100).optional(),
    orderUrl: nullableHttpUrlSchema.optional(),
    reservationUrl: nullableHttpUrlSchema.optional(),
    instagramUrl: nullableHttpUrlSchema.optional(),
    facebookUrl: nullableHttpUrlSchema.optional(),
    reviewDecision: z.enum(["APPROVED", "REJECTED"]).optional(),
    criticalFieldsConfirmed: z.literal(true).optional()
  })
  .superRefine((data, context) => {
    const changedFields = [
      data.name,
      data.addressLine1,
      data.addressLine2,
      data.postalCode,
      data.city,
      data.countryCode,
      data.phone,
      data.businessHours,
      data.services,
      data.orderUrl,
      data.reservationUrl,
      data.instagramUrl,
      data.facebookUrl,
      data.reviewDecision
    ];
    if (changedFields.every((value) => value === undefined)) {
      context.addIssue({ code: "custom", message: "Aucune correction fournie." });
    }

    const hasCriticalChange =
      data.addressLine1 !== undefined ||
      data.addressLine2 !== undefined ||
      data.postalCode !== undefined ||
      data.city !== undefined ||
      data.countryCode !== undefined ||
      data.phone !== undefined ||
      data.businessHours !== undefined;
    if (
      (hasCriticalChange || data.reviewDecision === "APPROVED") &&
      data.criticalFieldsConfirmed !== true
    ) {
      context.addIssue({
        code: "custom",
        path: ["criticalFieldsConfirmed"],
        message: "L’adresse, le téléphone et les horaires doivent être explicitement confirmés."
      });
    }
  });

const brandTones = [
  "PREMIUM",
  "GOURMAND",
  "WARM",
  "TRENDY",
  "FAMILY",
  "MODERN",
  "DYNAMIC",
  "HUMOROUS",
  "SOBER"
] as const;

const socialPlatforms = ["INSTAGRAM", "FACEBOOK"] as const;

export const brandProfileQuerySchema = z.object(organizationTarget);

export const brandProfilePatchSchema = z
  .object({
    ...organizationTarget,
    logoMediaAssetId: z.string().trim().min(1).max(100).nullable().optional(),
    slogan: nullableShortText(300).optional(),
    story: nullableShortText(10_000).optional(),
    cuisineType: nullableShortText(200).optional(),
    positioning: nullableShortText(1_000).optional(),
    targetAudience: nullableShortText(1_000).optional(),
    geographicArea: nullableShortText(500).optional(),
    priceRange: nullableShortText(100).optional(),
    tones: z
      .array(z.enum(brandTones))
      .max(brandTones.length)
      .refine((items) => new Set(items).size === items.length, "Les tons doivent être uniques.")
      .optional(),
    colors: jsonObjectSchema.nullable().optional(),
    typography: jsonObjectSchema.nullable().optional(),
    allowedExpressions: uniqueTextArray(100, 200).optional(),
    wordsToAvoid: uniqueTextArray(100, 200).optional(),
    allowedEmojis: uniqueTextArray(50, 32).optional(),
    emojiUsageLevel: z.number().int().min(0).max(3).optional(),
    languages: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/)
      )
      .min(1)
      .max(10)
      .refine((items) => new Set(items).size === items.length, "Les langues doivent être uniques.")
      .optional(),
    orderLinks: orderLinksSchema.nullable().optional(),
    socialPlatforms: z
      .array(z.enum(socialPlatforms))
      .max(socialPlatforms.length)
      .refine(
        (items) => new Set(items).size === items.length,
        "Les plateformes doivent être uniques."
      )
      .optional(),
    customInstruction: nullableShortText(10_000).optional()
  })
  .refine(
    (data) =>
      data.logoMediaAssetId !== undefined ||
      data.slogan !== undefined ||
      data.story !== undefined ||
      data.cuisineType !== undefined ||
      data.positioning !== undefined ||
      data.targetAudience !== undefined ||
      data.geographicArea !== undefined ||
      data.priceRange !== undefined ||
      data.tones !== undefined ||
      data.colors !== undefined ||
      data.typography !== undefined ||
      data.allowedExpressions !== undefined ||
      data.wordsToAvoid !== undefined ||
      data.allowedEmojis !== undefined ||
      data.emojiUsageLevel !== undefined ||
      data.languages !== undefined ||
      data.orderLinks !== undefined ||
      data.socialPlatforms !== undefined ||
      data.customInstruction !== undefined,
    "Aucune modification fournie."
  );
