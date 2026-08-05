import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { describe, expect, it, vi } from "vitest";

import {
  OpenAIContentGenerationProvider,
  openAIGenerationEnvelopeSchema
} from "./openai-provider.js";
import type { GenerationRequest } from "./types.js";

function generationRequest(): GenerationRequest {
  return {
    organizationId: "org-secret-internal-id",
    brand: {
      id: "brand_1",
      name: "YokoSushi",
      tone: ["gourmand", "moderne"],
      guidelines: "Rester factuel.",
      forbiddenPhrases: ["explosion de saveurs"],
      languages: ["fr"]
    },
    establishments: [],
    products: [
      {
        id: "product_1",
        name: "Produit validé",
        category: "Sushi",
        price: "12.00 EUR",
        establishmentIds: [],
        validated: true
      }
    ],
    media: [],
    platforms: ["instagram", "facebook"],
    establishmentIds: [],
    count: 1,
    startDate: "2026-08-03T00:00:00.000Z",
    demoMode: false
  };
}

describe("OpenAIContentGenerationProvider", () => {
  it("utilise Responses Structured Outputs sans stocker l’identifiant interne", async () => {
    const parse = vi.fn().mockResolvedValue({
      output_parsed: {
        posts: [
          {
            title: "Une sélection YokoSushi",
            objective: "Présenter un produit validé",
            establishmentIds: [],
            platforms: ["instagram", "facebook"],
            format: "image",
            topic: "product",
            instagramCaption: "Produit validé, à découvrir chez YokoSushi 🍣",
            facebookCaption: "Découvrez ce produit validé sur la carte YokoSushi.",
            callToAction: "Consulter la carte",
            hashtags: ["#YokoSushi"],
            mediaAssetIds: [],
            suggestedAt: null,
            reelScript: null,
            storyFrames: null,
            carouselSlides: null,
            rationale: "Le produit est validé dans le contexte fourni.",
            warnings: []
          }
        ]
      }
    });
    const client = { responses: { parse } } as unknown as Pick<OpenAI, "responses">;
    const provider = new OpenAIContentGenerationProvider({
      apiKey: "test-key-not-real",
      model: "gpt-5.6-terra",
      client
    });

    const result = await provider.generate(generationRequest());

    expect(result).toMatchObject({ posts: [{ title: "Une sélection YokoSushi" }] });
    expect(parse).toHaveBeenCalledOnce();
    const request = parse.mock.calls[0]?.[0] as {
      model: string;
      store: boolean;
      reasoning: { effort: string };
      safety_identifier: string;
      input: unknown;
    };
    expect(request.model).toBe("gpt-5.6-terra");
    expect(request.store).toBe(false);
    expect(request.reasoning.effort).toBe("none");
    expect(request.safety_identifier).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(request.input)).not.toContain("org-secret-internal-id");
  });

  it("n’envoie aucun échappement Unicode dans le schéma de sortie structurée", () => {
    // Les sorties structurées d’OpenAI rejettent la requête entière avec « Invalid schema
    // for response_format » dès qu’un motif contient un échappement `\p{…}`. La génération
    // de publications échouait ainsi à chaque appel en mode IA réel.
    const format = zodTextFormat(openAIGenerationEnvelopeSchema, "yokosushi_social_posts");

    expect(JSON.stringify(format)).not.toContain("\\p{");
  });
});
