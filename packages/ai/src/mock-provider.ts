import type { GeneratedPost } from "@yokosocial/shared";

import type { ContentGenerationProvider, GenerationRequest } from "./types.js";

const topicPlan = ["platter", "product", "delivery", "restaurant", "local"] as const;
const formatPlan = ["image", "carousel", "story", "image", "reel"] as const;
const callsToAction = [
  "Découvrez la carte",
  "Choisissez votre prochain favori",
  "Préparez votre prochaine commande",
  "Venez découvrir l’ambiance",
  "Dites-nous votre envie du moment"
] as const;

function isoAt(startDate: string, index: number): string {
  const date = new Date(startDate);
  date.setUTCDate(date.getUTCDate() + index * 2);
  date.setUTCHours(index % 2 === 0 ? 11 : 18, 30, 0, 0);
  return date.toISOString();
}

function makePost(request: GenerationRequest, index: number): GeneratedPost {
  const product = request.products[index % Math.max(request.products.length, 1)];
  const approvedMedia = request.media.filter((media) => media.status === "APPROVED");
  const qualityMedia = approvedMedia.filter((media) => media.qualityScore >= 70);
  const eligibleMedia = qualityMedia.length > 0 ? qualityMedia : approvedMedia;
  const primaryMedia = eligibleMedia[index % Math.max(eligibleMedia.length, 1)];
  const secondaryMedia = eligibleMedia[(index + 1) % Math.max(eligibleMedia.length, 1)];
  const establishmentNames = request.establishments
    .filter((establishment) => request.establishmentIds.includes(establishment.id))
    .map((establishment) => establishment.name.replace(" — DÉMONSTRATION", ""));
  const localLabel = establishmentNames.length === 1 ? ` à ${establishmentNames[0]}` : "";
  const itemName = product?.name.replace(" — PRODUIT DE DÉMONSTRATION", "") ?? "notre sélection";
  const topic = topicPlan[index % topicPlan.length] ?? "product";
  const plannedFormat = formatPlan[index % formatPlan.length] ?? "image";
  const format = plannedFormat === "carousel" && eligibleMedia.length < 2 ? "image" : plannedFormat;
  const mediaAssetIds = primaryMedia ? [primaryMedia.id] : [];

  if (format === "carousel" && secondaryMedia && secondaryMedia.id !== primaryMedia?.id) {
    mediaAssetIds.push(secondaryMedia.id);
  }

  const demoWarning = request.demoMode
    ? "Contenu de démonstration : produit, média et informations locales à remplacer par des données importées puis validées."
    : undefined;
  const groundingWarning =
    request.establishmentIds.length > 0 && !product
      ? "Aucun produit n’est encore validé comme disponible dans tous les établissements sélectionnés : le texte reste volontairement générique."
      : undefined;
  const qualityWarning =
    primaryMedia && primaryMedia.qualityScore < 70
      ? "Aucune photo approuvée n’atteint le score qualité recommandé de 70/100 : vérification visuelle requise."
      : undefined;

  const base: GeneratedPost = {
    title:
      [
        "Le plateau qui rassemble",
        "Un détail qui change tout",
        "Votre pause sushi, simplement",
        "Une table, une ambiance, un moment",
        "Dans les coulisses de YokoSushi"
      ][index] ?? `Idée ${index + 1}`,
    objective:
      [
        "Mettre en avant un plateau à partager",
        "Valoriser un produit réel de la carte",
        "Rappeler le service de commande sans inventer de délai",
        "Présenter un établissement sélectionné",
        "Créer un format dynamique sans générer de vidéo"
      ][index] ?? "Valoriser la marque",
    establishmentIds: request.establishmentIds,
    platforms: request.platforms,
    format,
    topic,
    instagramCaption: `Une pause gourmande, des pièces préparées avec soin et ${itemName.toLowerCase()} au centre de l’image.${localLabel} 🍣\n\nÀ vous de choisir la prochaine bouchée.`,
    facebookCaption: `Envie d’une pause sushi${localLabel} ? Aujourd’hui, nous mettons en avant ${itemName.toLowerCase()}. Consultez la carte validée et choisissez ce qui vous fait envie.`,
    callToAction: callsToAction[index] ?? "Découvrir la carte",
    hashtags: [
      "#YokoSushi",
      "#SushiToulouse",
      `#${topic === "platter" ? "PlateauSushi" : "PauseSushi"}`
    ],
    mediaAssetIds,
    suggestedAt: isoAt(request.startDate, index),
    rationale: `Variation ${index + 1}/5 : angle ${topic}, format ${format}, média priorisé selon le score qualité et l’usage.`,
    warnings: [demoWarning, groundingWarning, qualityWarning].filter((warning): warning is string =>
      Boolean(warning)
    )
  };

  if (format === "carousel") {
    base.carouselSlides = mediaAssetIds.map((mediaAssetId, slideIndex) => ({
      headline: slideIndex === 0 ? "Choisissez votre envie" : "À partager… ou pas",
      body: "Texte de démonstration à vérifier avant validation.",
      mediaAssetId
    }));
  }
  if (format === "story") {
    base.storyFrames = [
      { headline: "Une envie de sushi ?", mediaAssetId: primaryMedia?.id },
      { headline: "Votre sélection vous attend", body: "Consultez la carte validée." }
    ];
  }
  if (format === "reel") {
    base.reelScript =
      "Durée recommandée : 12 secondes. Plan 1 (2 s) : façade ou ambiance. Plan 2 (4 s) : gros plan produit validé. Plan 3 (4 s) : composition du plateau. Plan 4 (2 s) : logo et appel à consulter la carte. Texte écran : « Votre pause YokoSushi ».";
  }

  return base;
}

export class MockContentGenerationProvider implements ContentGenerationProvider {
  readonly name = "mock";

  generate(request: GenerationRequest): Promise<unknown> {
    return Promise.resolve({
      posts: Array.from({ length: request.count }, (_, index) => makePost(request, index))
    });
  }
}
