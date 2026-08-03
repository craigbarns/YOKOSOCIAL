import * as cheerio from "cheerio";

import { isExactAllowedHttpsUrl } from "./security.js";
import type {
  DiscoveredLink,
  DiscoveredMedia,
  MediaCategoryHint,
  MediaSourceKind,
  OpenGraphMetadata
} from "./types.js";

export interface ExtractedHtmlContent {
  title?: string;
  description?: string;
  openGraph: OpenGraphMetadata;
  jsonLd: unknown[];
  links: DiscoveredLink[];
  media: DiscoveredMedia[];
  stylesheetUrls: string[];
  warnings: string[];
}

const MEDIA_FILE_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i;
const NON_MEDIA_FILE_EXTENSION = /\.(?:css|eot|js|map|otf|ttf|woff2?)(?:$|[?#])/i;
const JSON_LD_IMAGE_KEYS = new Set([
  "contenturl",
  "image",
  "logo",
  "primaryimageofpage",
  "thumbnail",
  "thumbnailurl"
]);

function resolveHttpUrl(value: string, baseUrl: string): string | null {
  const cleaned = value.trim().replace(/^['"]|['"]$/g, "");
  if (!cleaned || /^(?:blob|data|javascript|mailto|tel):/i.test(cleaned)) return null;
  try {
    const url = new URL(cleaned, baseUrl);
    if (!(["http:", "https:"] as string[]).includes(url.protocol)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function looksLikeMediaUrl(url: string): boolean {
  if (NON_MEDIA_FILE_EXTENSION.test(url)) return false;
  return MEDIA_FILE_EXTENSION.test(url) || !/\.[a-z0-9]{2,5}(?:$|[?#])/i.test(url);
}

function textOrUndefined(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}

function classifyMedia(url: string, context = ""): MediaCategoryHint {
  const searchable = `${url} ${context}`.toLowerCase();
  if (/\b(?:logo|brandmark)\b/.test(searchable)) return "LOGO";
  if (
    /(?:favicon|apple-touch|hamburger|loader|loading|spinner|sprite|tracking|pixel|\/icons?\/|arrow|button|close-panier|telephone\.png|mobile\/user|mobile\/chart)/.test(
      searchable
    )
  ) {
    return "TECHNICAL";
  }
  if (/(?:slider-resto|restaurant|resto|compans|p[ée]ri|terrasse)/.test(searchable)) {
    return "RESTAURANT";
  }
  if (
    /(?:produit|product|sushi|maki|california|sashimi|nigiri|poke|plateau|dessert|boisson)/.test(
      searchable
    )
  ) {
    return "PRODUCT";
  }
  return "UNCLASSIFIED";
}

function buildMedia(
  rawUrl: string,
  pageUrl: string,
  sourceKind: MediaSourceKind,
  allowedHosts: readonly string[],
  metadata: { alt?: string; title?: string; context?: string } = {}
): DiscoveredMedia | null {
  const url = resolveHttpUrl(rawUrl, pageUrl);
  if (!url || !looksLikeMediaUrl(url)) return null;
  const allowedForDownload = isExactAllowedHttpsUrl(url, allowedHosts);
  const context = textOrUndefined(metadata.context);
  const alt = textOrUndefined(metadata.alt);
  const title = textOrUndefined(metadata.title);
  return {
    url,
    pageUrl,
    sourceKind,
    allowedForDownload,
    isExternal: !allowedForDownload,
    categoryHint: classifyMedia(url, context),
    ...(alt ? { alt } : {}),
    ...(title ? { title } : {}),
    ...(context ? { context } : {})
  };
}

function parseSrcset(srcset: string): string[] {
  return srcset
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter((candidate): candidate is string => Boolean(candidate));
}

export function extractCssUrls(css: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const pattern = /url\(\s*(?:(['"])(.*?)\1|([^)'"\s]+))\s*\)/giu;
  for (const match of css.matchAll(pattern)) {
    const rawUrl = match[2] ?? match[3];
    if (!rawUrl) continue;
    const url = resolveHttpUrl(rawUrl, baseUrl);
    if (url && looksLikeMediaUrl(url)) urls.push(url);
  }
  return [...new Set(urls)];
}

export function extractCssMedia(
  css: string,
  baseUrl: string,
  pageUrl: string,
  allowedHosts: readonly string[]
): DiscoveredMedia[] {
  return extractCssUrls(css, baseUrl)
    .map((url) => buildMedia(url, pageUrl, "CSS_BACKGROUND", allowedHosts))
    .filter((media): media is DiscoveredMedia => media !== null);
}

function collectJsonLdMedia(
  value: unknown,
  pageUrl: string,
  allowedHosts: readonly string[],
  target: DiscoveredMedia[],
  depth = 0
): void {
  if (depth > 12 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((child) => collectJsonLdMedia(child, pageUrl, allowedHosts, target, depth + 1));
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (JSON_LD_IMAGE_KEYS.has(key.toLowerCase())) {
      if (typeof child === "string") {
        const media = buildMedia(child, pageUrl, "JSON_LD", allowedHosts, {
          context: `JSON-LD ${key}`
        });
        if (media) target.push(media);
      } else if (child && typeof child === "object") {
        const candidate = child as Record<string, unknown>;
        const nestedUrl = candidate.url ?? candidate.contentUrl ?? candidate.thumbnailUrl;
        if (typeof nestedUrl === "string") {
          const media = buildMedia(nestedUrl, pageUrl, "JSON_LD", allowedHosts, {
            context: `JSON-LD ${key}`
          });
          if (media) target.push(media);
        }
      }
    }
    collectJsonLdMedia(child, pageUrl, allowedHosts, target, depth + 1);
  }
}

function deduplicateMedia(media: DiscoveredMedia[]): DiscoveredMedia[] {
  const seen = new Set<string>();
  return media.filter((candidate) => {
    const key = `${candidate.sourceKind}:${candidate.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractHtmlContent(
  html: string,
  pageUrl: string,
  allowedHosts: readonly string[]
): ExtractedHtmlContent {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const media: DiscoveredMedia[] = [];
  const links: DiscoveredLink[] = [];
  const openGraph: OpenGraphMetadata = {};
  const jsonLd: unknown[] = [];

  const title = textOrUndefined($("title").first().text());
  const description = textOrUndefined($('meta[name="description"]').first().attr("content"));

  $("meta[property^='og:']").each((_index, element) => {
    const property = textOrUndefined($(element).attr("property"));
    const content = textOrUndefined($(element).attr("content"));
    if (!property || !content) return;
    (openGraph[property] ??= []).push(content);
    if (property === "og:image" || property === "og:image:secure_url") {
      const candidate = buildMedia(content, pageUrl, "OG_IMAGE", allowedHosts, {
        context: property
      });
      if (candidate) media.push(candidate);
    }
  });

  $("script[type='application/ld+json']").each((_index, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      jsonLd.push(parsed);
      collectJsonLdMedia(parsed, pageUrl, allowedHosts, media);
    } catch {
      warnings.push("Une balise JSON-LD invalide a été ignorée.");
    }
  });

  $("a[href]").each((_index, element) => {
    const rawUrl = $(element).attr("href");
    if (!rawUrl) return;
    const url = resolveHttpUrl(rawUrl, pageUrl);
    if (!url) return;
    links.push({
      url,
      pageUrl,
      text: $(element).text().replace(/\s+/g, " ").trim().slice(0, 240),
      isExternal: !isExactAllowedHttpsUrl(url, allowedHosts)
    });
  });

  const addElementMedia = (
    element: Parameters<cheerio.CheerioAPI>[0],
    attribute: string,
    sourceKind: MediaSourceKind
  ): void => {
    const wrapped = $(element);
    const rawUrl = wrapped.attr(attribute);
    if (!rawUrl) return;
    const context = wrapped.parent().text().replace(/\s+/g, " ").trim().slice(0, 240);
    const alt = wrapped.attr("alt");
    const title = wrapped.attr("title");
    const candidate = buildMedia(rawUrl, pageUrl, sourceKind, allowedHosts, {
      ...(alt ? { alt } : {}),
      ...(title ? { title } : {}),
      context
    });
    if (candidate) media.push(candidate);
  };

  $("img[src]").each((_index, element) => addElementMedia(element, "src", "IMG_SRC"));
  $("img[data-src]").each((_index, element) => addElementMedia(element, "data-src", "DATA_SRC"));
  $("img[data-lazy-src]").each((_index, element) =>
    addElementMedia(element, "data-lazy-src", "DATA_SRC")
  );
  $("video[poster]").each((_index, element) => addElementMedia(element, "poster", "IMG_SRC"));
  $("source[src]").each((_index, element) => addElementMedia(element, "src", "PICTURE_SOURCE"));

  $("img[srcset], source[srcset]").each((_index, element) => {
    const wrapped = $(element);
    const srcset = wrapped.attr("srcset");
    if (!srcset) return;
    const alt = wrapped.attr("alt");
    const title = wrapped.attr("title");
    for (const rawUrl of parseSrcset(srcset)) {
      const candidate = buildMedia(rawUrl, pageUrl, "IMG_SRCSET", allowedHosts, {
        ...(alt ? { alt } : {}),
        ...(title ? { title } : {})
      });
      if (candidate) media.push(candidate);
    }
  });

  $("[style]").each((_index, element) => {
    const style = $(element).attr("style");
    if (!style || !/background(?:-image)?\s*:/i.test(style)) return;
    media.push(...extractCssMedia(style, pageUrl, pageUrl, allowedHosts));
  });
  $("style").each((_index, element) => {
    media.push(...extractCssMedia($(element).text(), pageUrl, pageUrl, allowedHosts));
  });

  const stylesheetUrls = $("link[rel~='stylesheet'][href]")
    .map((_index, element) => resolveHttpUrl($(element).attr("href") ?? "", pageUrl))
    .get()
    .filter((url): url is string => Boolean(url));

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    openGraph,
    jsonLd,
    links: [...new Map(links.map((link) => [link.url, link])).values()],
    media: deduplicateMedia(media),
    stylesheetUrls: [...new Set(stylesheetUrls)],
    warnings
  };
}

export function canonicalizePageUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  url.search = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

export function isLikelyPublicHtmlPage(url: URL): boolean {
  const blockedPrefixes = [
    "/admin",
    "/api",
    "/broadcasting",
    "/commande",
    "/compte",
    "/connexion",
    "/checkout",
    "/inscription",
    "/logout",
    "/panier",
    "/password"
  ];
  if (
    blockedPrefixes.some(
      (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)
    )
  ) {
    return false;
  }
  return !/\.(?:css|gif|ico|jpe?g|js|json|map|pdf|png|svg|webp|xml)$/i.test(url.pathname);
}
