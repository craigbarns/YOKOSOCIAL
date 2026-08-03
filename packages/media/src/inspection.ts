import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const maxBytes = 25 * 1024 * 1024;

export type MediaInspection = {
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  bytes: number;
  ratio: number;
  hasAlpha: boolean;
  qualityScore: number;
  status: "APPROVED" | "NEEDS_REVIEW" | "LOW_QUALITY";
  warnings: string[];
};

export async function inspectImage(buffer: Uint8Array): Promise<MediaInspection> {
  if (buffer.byteLength > maxBytes) throw new Error("Le fichier dépasse la limite de 25 Mo.");
  const fileType = await fileTypeFromBuffer(buffer);
  if (!fileType || !allowedMimeTypes.has(fileType.mime)) {
    throw new Error("Type MIME image non autorisé ou non reconnu.");
  }

  const image = sharp(buffer, { failOn: "warning" }).rotate();
  const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
  if (!metadata.width || !metadata.height) throw new Error("Dimensions d’image introuvables.");

  const warnings: string[] = [];
  const pixels = metadata.width * metadata.height;
  const shortest = Math.min(metadata.width, metadata.height);
  let qualityScore = 35;

  qualityScore += Math.min(25, Math.round((pixels / 2_000_000) * 25));
  qualityScore += Math.min(15, Math.round((shortest / 1080) * 15));

  const visibleChannels = stats.channels.slice(0, 3);
  const brightness =
    visibleChannels.reduce((total, channel) => total + channel.mean, 0) /
    Math.max(visibleChannels.length, 1);
  const contrast =
    visibleChannels.reduce((total, channel) => total + channel.stdev, 0) /
    Math.max(visibleChannels.length, 1);

  if (brightness >= 45 && brightness <= 220) qualityScore += 12;
  else warnings.push("Luminosité potentiellement insuffisante ou excessive.");
  if (contrast >= 25) qualityScore += 8;
  else warnings.push("Contraste faible détecté.");
  if (shortest < 600) warnings.push("Résolution insuffisante pour une publication principale.");
  if (metadata.width < 160 || metadata.height < 160) {
    warnings.push("Miniature technique probable.");
    qualityScore = Math.min(qualityScore, 25);
  }

  qualityScore = Math.max(0, Math.min(100, qualityScore));
  const status =
    shortest < 600 || qualityScore < 50
      ? "LOW_QUALITY"
      : qualityScore >= 75
        ? "APPROVED"
        : "NEEDS_REVIEW";

  return {
    mimeType: fileType.mime,
    extension: fileType.ext,
    width: metadata.width,
    height: metadata.height,
    bytes: buffer.byteLength,
    ratio: Number((metadata.width / metadata.height).toFixed(4)),
    hasAlpha: metadata.hasAlpha ?? false,
    qualityScore,
    status,
    warnings
  };
}

export function classifyByContext(input: {
  filename: string;
  alt?: string;
  title?: string;
  nearbyText?: string;
  productCategory?: string;
}): string {
  const text = Object.values(input).filter(Boolean).join(" ").toLocaleLowerCase("fr");
  const matches: Array<[RegExp, string]> = [
    [/logo|yoko[-_ ]?sushi/, "logo"],
    [/plateau|box|assortiment/, "plateaux"],
    [/california/, "california"],
    [/sashimi/, "sashimi"],
    [/nigiri|sushi/, "nigiri"],
    [/maki/, "maki"],
    [/pok[eé]/, "poke"],
    [/dessert|mochi/, "desserts"],
    [/boisson|soda/, "boissons"],
    [/livraison|delivery|scooter/, "livraison"],
    [/restaurant|terrasse|salle/, "restaurant"],
    [/equipe|équipe|chef|team/, "équipe"],
    [/promo|offre|promotion/, "promotions"]
  ];
  return matches.find(([pattern]) => pattern.test(text))?.[1] ?? "non classé";
}
