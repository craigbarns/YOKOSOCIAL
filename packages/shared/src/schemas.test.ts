import { describe, expect, it } from "vitest";

import { generatedPostSchema } from "./schemas.js";

describe("generatedPostSchema", () => {
  it("rejette un carrousel sans deux slides", () => {
    const result = generatedPostSchema.safeParse({
      title: "Test",
      objective: "Présenter un produit validé",
      establishmentIds: [],
      platforms: ["instagram"],
      format: "carousel",
      topic: "product",
      instagramCaption: "Texte",
      callToAction: "Commander",
      hashtags: ["#YokoSushi"],
      mediaAssetIds: [],
      carouselSlides: [{ headline: "Une slide" }],
      rationale: "Test",
      warnings: []
    });

    expect(result.success).toBe(false);
  });
});
