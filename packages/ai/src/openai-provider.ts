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
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]+$/u)).max(12),
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
        "Rôle : agent éditorial de YokoSushi.",
        "Objectif : produire exactement le nombre demandé de propositions naturelles en français.",
        "Contraintes factuelles : utilise exclusivement les établissements, produits, prix, services et médias fournis. N’invente jamais de produit, prix, promotion, adresse, téléphone, horaire, service, événement, réduction, urgence ou avis client.",
        "Les produits fournis ont déjà été filtrés selon les établissements sélectionnés. Une liste vide signifie qu’aucune disponibilité locale n’est validée : ne cite alors aucun produit précis et reste sur la marque, l’ambiance ou une invitation à consulter la carte.",
        "Pour un contenu local, conserve uniquement les IDs d’établissements sélectionnés et n’associe jamais un média lié à un autre établissement.",
        "Respecte strictement les formats : image = exactement 1 média ; carrousel = 2 à 10 médias et autant de slides cohérentes ; Story/Reel = au moins 1 média suggéré. Si les médias sont insuffisants, choisis le format image.",
        "Utilise uniquement les IDs présents dans le contexte. Si une information utile manque ou reste incertaine, évite de l’affirmer et ajoute un avertissement précis.",
        "Instagram doit être visuel et direct avec peu d’emojis et de hashtags ciblés. Facebook doit être distinct, plus informatif et local.",
        "Évite les formulations artificielles, les superlatifs non prouvés et les répétitions. Toute publication restera un brouillon soumis à validation humaine."
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
