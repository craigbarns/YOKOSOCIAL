import { describe, expect, it } from "vitest";

import { schedulePostSchema, updatePostSchema } from "./post-contract";

const validPost = {
  organizationId: "org_1",
  title: "Le plateau du week-end",
  objective: "Présenter un produit validé",
  platforms: ["instagram", "facebook"],
  format: "image",
  topic: "platter",
  instagramCaption: "Notre plateau validé.",
  facebookCaption: "Retrouvez notre plateau validé chez YokoSushi.",
  callToAction: "Commandez depuis le lien officiel.",
  hashtags: ["#YokoSushi"],
  establishmentIds: ["est_1"],
  mediaAssetIds: ["media_1"],
  scheduledAt: "2026-08-10T10:00:00+02:00",
  internalNote: null
};

describe("contrats des publications", () => {
  it("valide une version éditoriale complète", () => {
    expect(updatePostSchema.parse(validPost)).toMatchObject({ title: validPost.title });
  });

  it("refuse un réseau sans sa légende", () => {
    const result = updatePostSchema.safeParse({ ...validPost, instagramCaption: null });
    expect(result.success).toBe(false);
  });

  it("refuse une publication image sans média", () => {
    const result = updatePostSchema.safeParse({ ...validPost, mediaAssetIds: [] });
    expect(result.success).toBe(false);
  });

  it("refuse deux fois le même compte social", () => {
    const result = schedulePostSchema.safeParse({
      organizationId: "org_1",
      scheduledAt: "2026-08-10T10:00:00+02:00",
      socialAccountIds: ["account_1", "account_1"]
    });
    expect(result.success).toBe(false);
  });
});
