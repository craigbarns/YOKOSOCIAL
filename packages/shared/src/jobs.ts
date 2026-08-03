import { z } from "zod";

export const jobNames = [
  "website-import.scan",
  "media.ingest",
  "content.generate",
  "publication.schedule",
  "publication.reconcile",
  "analytics.sync"
] as const;

export const jobNameSchema = z.enum(jobNames);
export type JobName = z.infer<typeof jobNameSchema>;

export const tenantJobPayloadSchema = z
  .object({
    organizationId: z.string().min(1),
    actorId: z.string().min(1),
    resourceId: z.string().min(1),
    idempotencyKey: z.string().min(1).max(200)
  })
  .strict();

export type TenantJobPayload = z.infer<typeof tenantJobPayloadSchema>;

export const websiteImportScanJobPayloadSchema = tenantJobPayloadSchema;
export type WebsiteImportScanJobPayload = TenantJobPayload;

export const mediaIngestJobPayloadSchema = tenantJobPayloadSchema
  .extend({
    websiteImportId: z.string().min(1),
    brandId: z.string().min(1),
    sourceUrl: z.url(),
    sourcePageUrl: z.url()
  })
  .strict();

export type MediaIngestJobPayload = z.infer<typeof mediaIngestJobPayloadSchema>;

const forbiddenJobKey = /(secret|token|password|api.?key|authorization|cookie)/i;

/**
 * Queue messages are durable infrastructure data. They only contain tenant and
 * resource identifiers; credentials are resolved by the worker at execution.
 */
export function assertSafeJobPayload(payload: TenantJobPayload): void {
  tenantJobPayloadSchema.passthrough().parse(payload);

  const inspect = (value: unknown, depth = 0): void => {
    if (depth > 12 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((child) => inspect(child, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenJobKey.test(key)) {
        throw new Error("Les secrets sont interdits dans les payloads BullMQ.");
      }
      inspect(child, depth + 1);
    }
  };

  inspect(payload);
}
