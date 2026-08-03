import { YOKOSUSHI_ALLOWED_HOSTS, isExactAllowedHttpsUrl } from "@yokosocial/website-importer";
import { z } from "zod";

export const websiteImportRequestSchema = z
  .object({
    organizationId: z.string().min(1),
    brandId: z.string().min(1),
    websiteUrl: z
      .url()
      .refine(
        (value) => isExactAllowedHttpsUrl(value, YOKOSUSHI_ALLOWED_HOSTS),
        "Seules les URLs HTTPS de yokosushi.fr sont autorisées."
      )
  })
  .strict();

export const websiteImportListQuerySchema = z.object({
  organizationId: z.string().min(1),
  brandId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");

export const websiteImportDetailQuerySchema = z.object({
  organizationId: z.string().trim().min(1).max(100),
  dataAfter: z.string().trim().min(1).max(100).optional(),
  mediaAfter: z.string().trim().min(1).max(100).optional(),
  includeData: booleanQuery.default(true),
  includeMedia: booleanQuery.default(true),
  pageSize: z.coerce.number().int().min(1).max(250).default(200)
});

export function normalizeYokoSushiWebsiteUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.username = "";
  url.password = "";
  return url.href;
}
