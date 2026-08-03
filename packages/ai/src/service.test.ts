import { demoEstablishments, demoMedia, demoProducts } from "@yokosocial/shared";
import { describe, expect, it, vi } from "vitest";

import { MockContentGenerationProvider } from "./mock-provider.js";
import { ContentGenerationService, repetitionScore } from "./service.js";
import type { GenerationRequest } from "./types.js";

function request(): GenerationRequest {
  return {
    organizationId: "demo-org-yokosushi",
    brand: {
      id: "demo-brand-yokosushi",
      name: "YokoSushi — DÉMONSTRATION",
      tone: ["gourmand", "moderne"],
      guidelines: "Données fictives clairement marquées.",
      forbiddenPhrases: ["explosion de saveurs"],
      languages: ["fr"]
    },
    establishments: demoEstablishments.map((item) => ({
      ...item,
      services: [...item.services],
      validatedFields: []
    })),
    products: demoProducts.map((item) => ({
      ...item,
      establishmentIds: [...item.establishmentIds],
      validated: false,
      demo: true
    })),
    media: demoMedia.map((item) => ({
      ...item,
      establishmentIds: [...item.establishmentIds]
    })),
    platforms: ["instagram", "facebook"],
    establishmentIds: ["demo-establishment-compans"],
    count: 5,
    startDate: "2026-08-03T00:00:00.000Z",
    demoMode: true
  };
}

describe("ContentGenerationService", () => {
  it("génère cinq propositions structurées et marquées démo", async () => {
    const service = new ContentGenerationService(new MockContentGenerationProvider());
    const result = await service.generate(request());

    expect(result.posts).toHaveLength(5);
    expect(
      result.posts.every((post) => post.warnings.some((warning) => /démo/i.test(warning)))
    ).toBe(true);
  });

  it("calcule une similarité bornée", () => {
    expect(repetitionScore("Plateau sushi gourmand", "Plateau sushi à partager")).toBeGreaterThan(
      0
    );
    expect(repetitionScore("Plateau", "Plateau")).toBe(100);
  });

  it("retire du contexte les produits et médias non validés pour tout le périmètre local", async () => {
    const provider = {
      name: "capture",
      generate: vi.fn((input: GenerationRequest) =>
        Promise.resolve({
          posts: [
            {
              title: "Publication locale prudente",
              objective: "Présenter la marque sans disponibilité supposée",
              establishmentIds: input.establishmentIds,
              platforms: input.platforms,
              format: "image",
              topic: "local",
              instagramCaption: "Une pause YokoSushi à découvrir.",
              facebookCaption: "Retrouvez l’univers YokoSushi.",
              callToAction: "Consulter la carte",
              hashtags: ["#YokoSushi"],
              mediaAssetIds: ["demo-media-platter"],
              rationale: "Aucun produit local non confirmé n’est cité.",
              warnings: []
            }
          ]
        })
      )
    };
    const input = request();
    input.count = 1;
    input.establishmentIds = ["demo-establishment-compans", "demo-establishment-peri"];

    await new ContentGenerationService(provider).generate(input);

    const grounded = provider.generate.mock.calls[0]?.[0];
    expect(grounded?.products.map((product) => product.id)).toEqual(["demo-product-platter"]);
    expect(grounded?.media.map((media) => media.id)).toEqual([
      "demo-media-platter",
      "demo-media-delivery"
    ]);
  });

  it("refuse un média rattaché à un autre établissement", async () => {
    const input = request();
    input.count = 1;
    const provider = {
      name: "unsafe",
      generate: vi.fn(() =>
        Promise.resolve({
          posts: [
            {
              title: "Mauvais rattachement",
              objective: "Tester la séparation locale",
              establishmentIds: ["demo-establishment-compans"],
              platforms: ["instagram"],
              format: "image",
              topic: "local",
              instagramCaption: "Test",
              callToAction: "Consulter la carte",
              hashtags: ["#YokoSushi"],
              mediaAssetIds: ["demo-media-poke"],
              rationale: "Test de sécurité.",
              warnings: []
            }
          ]
        })
      )
    };

    await expect(new ContentGenerationService(provider).generate(input)).rejects.toThrow(
      /média inconnu|non associés/
    );
  });
});
