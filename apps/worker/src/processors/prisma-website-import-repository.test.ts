import { describe, expect, it } from "vitest";

import { pendingMediaPayload } from "./prisma-website-import-repository.js";

const digest = "a".repeat(64);
const resourceId = `media-${digest}`;
const idempotencyKey = `media-ingest-import-1-${digest}`;

function candidateValue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "MEDIA_CANDIDATE",
    resourceId,
    idempotencyKey,
    sourceUrl: "https://www.yokosushi.fr/images/sushi.jpg",
    sourcePageUrl: "https://www.yokosushi.fr/carte",
    ...overrides
  };
}

function recover(value: unknown = candidateValue()) {
  return pendingMediaPayload({
    importId: "import-1",
    organizationId: "org-yoko",
    actorId: "user-owner",
    brandId: "brand-yoko",
    key: `media:${resourceId}`,
    value
  });
}

describe("pendingMediaPayload", () => {
  it("reconstruit le payload et l'identifiant idempotent après redémarrage", () => {
    expect(recover()).toEqual({
      kind: "PENDING",
      payload: {
        organizationId: "org-yoko",
        actorId: "user-owner",
        resourceId,
        idempotencyKey,
        websiteImportId: "import-1",
        brandId: "brand-yoko",
        sourceUrl: "https://www.yokosushi.fr/images/sushi.jpg",
        sourcePageUrl: "https://www.yokosushi.fr/carte"
      }
    });
  });

  it("n'enqueue plus un candidat déjà stocké", () => {
    expect(recover(candidateValue({ ingestionStatus: "STORED" }))).toEqual({
      kind: "COMPLETED"
    });
  });

  it("refuse une clé idempotente persistée qui ne correspond pas au candidat", () => {
    expect(recover(candidateValue({ idempotencyKey: "media-ingest-attacker" }))).toEqual({
      kind: "INVALID"
    });
  });
});
