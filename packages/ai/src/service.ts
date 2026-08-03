import { generatedPostSchema } from "@yokosocial/shared";
import { z } from "zod";

import type { ContentGenerationProvider, GenerationRequest, GenerationResult } from "./types.js";

const providerResponseSchema = z.object({ posts: z.array(z.unknown()).min(1).max(30) });

function groundPost(post: z.infer<typeof generatedPostSchema>, request: GenerationRequest) {
  const allowedEstablishments = new Set(request.establishmentIds);
  const mediaById = new Map(request.media.map((media) => [media.id, media]));
  const warnings = [...post.warnings];

  if (post.establishmentIds.some((id) => !allowedEstablishments.has(id))) {
    throw new Error("La génération référence un établissement hors du périmètre sélectionné.");
  }
  if (post.platforms.some((platform) => !request.platforms.includes(platform))) {
    throw new Error("La génération référence une plateforme hors du périmètre sélectionné.");
  }
  if (post.mediaAssetIds.some((id) => !mediaById.has(id))) {
    throw new Error("La génération référence un média inconnu.");
  }

  const postEstablishments = new Set(post.establishmentIds);
  for (const mediaAssetId of post.mediaAssetIds) {
    const media = mediaById.get(mediaAssetId);
    if (!media || postEstablishments.size === 0 || media.establishmentIds.length === 0) continue;
    if ([...postEstablishments].some((id) => !media.establishmentIds.includes(id))) {
      throw new Error("La génération mélange un média et un établissement non associés.");
    }
  }

  const selectedEstablishments = request.establishments.filter((item) =>
    post.establishmentIds.includes(item.id)
  );
  if (
    selectedEstablishments.some((item) =>
      ["address", "phone", "openingHours", "services"].some(
        (field) => item[field as keyof typeof item] && !item.validatedFields.includes(field)
      )
    )
  ) {
    warnings.push("Certaines informations locales existent mais ne sont pas encore validées.");
  }

  return { ...post, warnings: [...new Set(warnings)] };
}

function scopedGrounding(request: GenerationRequest): GenerationRequest {
  if (request.establishmentIds.length === 0) return request;

  const selectedIds = new Set(request.establishmentIds);
  const isAvailableEverywhere = (establishmentIds: string[]) =>
    [...selectedIds].every((id) => establishmentIds.includes(id));

  return {
    ...request,
    products: request.products.filter((product) => isAvailableEverywhere(product.establishmentIds)),
    media: request.media.filter(
      (media) =>
        media.establishmentIds.length === 0 || isAvailableEverywhere(media.establishmentIds)
    )
  };
}

export class ContentGenerationService {
  constructor(private readonly provider: ContentGenerationProvider) {}

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    if (request.count < 1 || request.count > 30) {
      throw new Error("Le nombre de publications doit être compris entre 1 et 30.");
    }
    const groundedRequest = scopedGrounding(request);
    const unknownResponse = await this.provider.generate(groundedRequest);
    const envelope = providerResponseSchema.parse(unknownResponse);
    const posts = [];
    let rejectedCount = 0;

    for (const candidate of envelope.posts) {
      const parsed = generatedPostSchema.safeParse(candidate);
      if (!parsed.success) {
        rejectedCount += 1;
        continue;
      }
      posts.push(groundPost(parsed.data, groundedRequest));
    }

    if (posts.length === 0) {
      throw new Error("Le provider n’a produit aucune publication valide.");
    }
    if (posts.length !== request.count) {
      throw new Error(
        `Le provider a produit ${posts.length} publication(s) valide(s) sur ${request.count} demandée(s).`
      );
    }

    return {
      posts,
      rejectedCount,
      globalWarnings:
        rejectedCount > 0 ? [`${rejectedCount} proposition(s) invalide(s) ont été écartées.`] : []
    };
  }
}

export function repetitionScore(a: string, b: string): number {
  const tokens = (text: string) =>
    new Set(
      text
        .toLocaleLowerCase("fr")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2)
    );
  const left = tokens(a);
  const right = tokens(b);
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token));
  return Math.round((intersection.length / union.size) * 100);
}
