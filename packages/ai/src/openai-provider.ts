import { createHash } from "node:crypto";

import {
  platformSchema,
  postFormatSchema,
  postTopicSchema,
  type GeneratedPost
} from "@yokosocial/shared";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { ContentGenerationProvider, GenerationRequest } from "./types.js";

const wireStoryFrameSchema = z.object({
  headline: z.string().min(1).max(90),
  body: z.string().max(180).nullable(),
  mediaAssetId: z.string().min(1).nullable()
});

const wireCarouselSlideSchema = z.object({
  headline: z.string().min(1).max(120),
  body: z.string().max(240).nullable(),
  mediaAssetId: z.string().min(1).nullable()
});

const wirePostSchema = z.object({
  title: z.string().min(1).max(120),
  objective: z.string().min(1).max(240),
  establishmentIds: z.array(z.string().min(1)).max(30),
  platforms: z.array(platformSchema).min(1).max(2),
  format: postFormatSchema,
  topic: postTopicSchema,
  instagramCaption: z.string().max(2_200).nullable(),
  facebookCaption: z.string().max(5_000).nullable(),
  callToAction: z.string().min(1).max(180),
  // Aucune expression régulière ici : les sorties structurées d’OpenAI refusent les
  // échappements Unicode `\p{…}` et rejettent la requête entière avec « Invalid schema
  // for response_format ». La forme des hashtags reste garantie par `generatedPostSchema`
  // de @yokosocial/shared, qui revalide chaque publication après réception.
  hashtags: z.array(z.string()).max(12),
  mediaAssetIds: z.array(z.string().min(1)).max(10),
  suggestedAt: z.iso.datetime({ offset: true }).nullable(),
  reelScript: z.string().max(3_000).nullable(),
  storyFrames: z.array(wireStoryFrameSchema).max(10).nullable(),
  carouselSlides: z.array(wireCarouselSlideSchema).max(10).nullable(),
  rationale: z.string().min(1).max(1_000),
  warnings: z.array(z.string().max(300)).max(20)
});

export const openAIGenerationEnvelopeSchema = z.object({
  posts: z.array(wirePostSchema).min(1).max(30)
});

type OpenAIProviderOptions = {
  apiKey: string;
  model: string;
  reasoningEffort?: "none" | "low" | "medium";
  client?: Pick<OpenAI, "responses">;
};

function removeNulls(post: z.infer<typeof wirePostSchema>): GeneratedPost {
  return {
    title: post.title,
    objective: post.objective,
    establishmentIds: post.establishmentIds,
    platforms: post.platforms,
    format: post.format,
    topic: post.topic,
    ...(post.instagramCaption ? { instagramCaption: post.instagramCaption } : {}),
    ...(post.facebookCaption ? { facebookCaption: post.facebookCaption } : {}),
    callToAction: post.callToAction,
    hashtags: post.hashtags,
    mediaAssetIds: post.mediaAssetIds,
    ...(post.suggestedAt ? { suggestedAt: post.suggestedAt } : {}),
    ...(post.reelScript ? { reelScript: post.reelScript } : {}),
    ...(post.storyFrames
      ? {
          storyFrames: post.storyFrames.map((frame) => ({
            headline: frame.headline,
            ...(frame.body ? { body: frame.body } : {}),
            ...(frame.mediaAssetId ? { mediaAssetId: frame.mediaAssetId } : {})
          }))
        }
      : {}),
    ...(post.carouselSlides
      ? {
          carouselSlides: post.carouselSlides.map((slide) => ({
            headline: slide.headline,
            ...(slide.body ? { body: slide.body } : {}),
            ...(slide.mediaAssetId ? { mediaAssetId: slide.mediaAssetId } : {})
          }))
        }
      : {}),
    rationale: post.rationale,
    warnings: post.warnings
  };
}

function privacySafeIdentifier(organizationId: string): string {
  return createHash("sha256").update(`yokosocial:${organizationId}`).digest("hex");
}

export class OpenAIContentGenerationProvider implements ContentGenerationProvider {
  readonly name = "openai";
  private readonly client: Pick<OpenAI, "responses">;
  private readonly model: string;
  private readonly reasoningEffort: "none" | "low" | "medium";

  constructor(options: OpenAIProviderOptions) {
    if (!options.apiKey.trim()) throw new Error("Une clé OpenAI serveur est requise.");
    if (!options.model.trim()) throw new Error("Un modèle OpenAI est requis.");
    this.client = options.client ?? new OpenAI({ apiKey: options.apiKey });
    this.model = options.model;
    this.reasoningEffort = options.reasoningEffort ?? "none";
  }

  async generate(request: GenerationRequest): Promise<unknown> {
    const response = await this.client.responses.parse({
      model: this.model,
      store: false,
      safety_identifier: privacySafeIdentifier(request.organizationId),
      reasoning: { effort: this.reasoningEffort },
      max_output_tokens: 10_000,
      instructions: [
        `Rôle : Directeur de création & Community Manager haut de gamme pour le restaurant ${request.brand?.name ?? "YokoSushi"}.`,
        "Objectif : Générer des publications ultra-professionnelles, captivantes et immédiatement prêtes à être publiées sur Instagram et Facebook.",
        "Qualité rédactionnelle & Style :",
        "- Rédiger avec un ton gourmand, élégant et immersif, mettant en valeur le savoir-faire japonais, la fraîcheur des poissons et l'ambiance chaleureuse du restaurant.",
        "- Varier les concepts éditoriaux sur la semaine : (1) Zoom produit / plat phare, (2) Ambiance & expérience en salle, (3) Offre du midi / livraison rapide, (4) Storytelling & fraîcheur des ingrédients, (5) Invitation à réserver/commander.",
        "- Légendes Instagram : accroche impactante dès la première ligne, texte aéré avec émojis gourmands élégants, call-to-action engageant et 6 à 8 hashtags à fort impact local (#YokoSushi #SushiToulouse #FoodPorn #ToulouseEats).",
        "- Légendes Facebook : plus informatives, soulignant la convivialité, les adresses des établissements et le lien direct vers la carte/commande.",
        "Sélection des médias : associer prioritairement les médias ayant les meilleurs scores de qualité aux produits ou sujets correspondants.",
        "Respect des contraintes factuelles : utiliser exclusivement les produits, adresses et horaires réels de l'établissement."
      ].join("\n"),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                brand: request.brand,
                establishments: request.establishments,
                products: request.products,
                media: request.media,
                platforms: request.platforms,
                selectedEstablishmentIds: request.establishmentIds,
                count: request.count,
                startDate: request.startDate,
                preferredTopics: request.preferredTopics ?? [],
                previousPosts: request.previousPosts ?? [],
                feedback: request.feedback ?? []
              })
            }
          ]
        }
      ],
      text: {
        verbosity: "low",
        format: zodTextFormat(openAIGenerationEnvelopeSchema, "yokosushi_social_posts")
      }
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI n’a pas retourné de contenu structuré exploitable.");
    }
    return { posts: response.output_parsed.posts.map(removeNulls) };
  }
}
