import { describe, expect, it } from "vitest";

import {
  assertSafeJobPayload,
  mediaIngestJobPayloadSchema,
  tenantJobPayloadSchema
} from "./jobs.js";

const basePayload = {
  organizationId: "org_1",
  actorId: "user_1",
  resourceId: "import_1",
  idempotencyKey: "website-import:import_1"
};

describe("contrats de jobs", () => {
  it("valide un message de tenant minimal sans secret", () => {
    expect(tenantJobPayloadSchema.parse(basePayload)).toEqual(basePayload);
    expect(() => assertSafeJobPayload(basePayload)).not.toThrow();
  });

  it("refuse les champs non prévus", () => {
    expect(() => tenantJobPayloadSchema.parse({ ...basePayload, apiKey: "interdit" })).toThrow();
  });

  it("refuse aussi une clé de secret imbriquée", () => {
    expect(() =>
      assertSafeJobPayload({
        ...basePayload,
        metadata: { credentials: { apiKey: "interdit" } }
      } as never)
    ).toThrow(/secrets/i);
  });

  it("valide un téléchargement média adressé par ressource", () => {
    const mediaPayload = mediaIngestJobPayloadSchema.parse({
      ...basePayload,
      websiteImportId: "import_1",
      brandId: "brand_1",
      sourceUrl: "https://www.yokosushi.fr/images/plateau.jpg",
      sourcePageUrl: "https://www.yokosushi.fr/carte"
    });

    expect(mediaPayload).toMatchObject({ websiteImportId: "import_1", brandId: "brand_1" });
    expect(() => assertSafeJobPayload(mediaPayload)).not.toThrow();
  });
});
