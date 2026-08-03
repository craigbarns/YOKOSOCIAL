import { z } from "zod";

import {
  canonicalizePageUrl,
  extractCssMedia,
  extractHtmlContent,
  isLikelyPublicHtmlPage
} from "./extractor.js";
import {
  CrawlerHttpError,
  SsrfSafeHttpClient,
  type Fetcher,
  type SafeHttpResponse,
  type Sleep
} from "./http.js";
import { parseRobotsTxt, type ParsedRobots } from "./robots.js";
import {
  boutiquesResponseSchema,
  crawlerOptionsSchema,
  familiesResponseSchema,
  familyDetailResponseSchema,
  type BoutiqueApi,
  type FamilyApi,
  type ProductApi
} from "./schemas.js";
import {
  isExactAllowedHttpsUrl,
  UrlSecurityError,
  UrlSecurityPolicy,
  type DnsResolver
} from "./security.js";
import {
  YOKOSUSHI_ALLOWED_HOSTS,
  type CrawlError,
  type CrawlerOptions,
  type CrawledPage,
  type DiscoveredLink,
  type DiscoveredMedia,
  type ImportedCategory,
  type ImportedEstablishment,
  type ImportedProduct,
  type SourceReference,
  type WebsiteCrawlerProvider,
  type WebsiteCrawlInput,
  type WebsiteCrawlResult
} from "./types.js";

export interface HttpCrawlerDependencies {
  fetcher?: Fetcher;
  dnsResolver?: DnsResolver;
  sleep?: Sleep;
  now?: () => Date;
}

class CrawlerDataError extends Error {
  readonly code: string;
  readonly url: string;

  constructor(code: string, message: string, url: string) {
    super(message);
    this.name = "CrawlerDataError";
    this.code = code;
    this.url = url;
  }
}

const deliveryAreaSchema = z.array(z.tuple([z.number(), z.number()]));

function parseJsonResponse<S extends z.ZodType>(
  response: SafeHttpResponse,
  schema: S
): z.output<S> {
  let raw: unknown;
  try {
    raw = JSON.parse(response.body);
  } catch {
    throw new CrawlerDataError(
      "INVALID_JSON",
      "La réponse attendue n’est pas un document JSON valide.",
      response.finalUrl
    );
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new CrawlerDataError(
      "INVALID_API_RESPONSE",
      "La structure de la réponse du site n’est pas reconnue.",
      response.finalUrl
    );
  }
  return parsed.data;
}

function sourceReference(
  sourceUrl: string,
  retrievedAt: string,
  confidence: number,
  location: { selector?: string; jsonPointer?: string; sourceModifiedAt?: string } = {}
): SourceReference {
  return {
    sourceUrl,
    retrievedAt,
    confidence,
    validationStatus: "PENDING",
    ...(location.selector ? { selector: location.selector } : {}),
    ...(location.jsonPointer ? { jsonPointer: location.jsonPointer } : {}),
    ...(location.sourceModifiedAt ? { sourceModifiedAt: location.sourceModifiedAt } : {})
  };
}

function parseNumber(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeCoordinates(
  boutique: BoutiqueApi,
  warnings: string[]
): ImportedEstablishment["coordinates"] {
  const rawLatitude = parseNumber(boutique.adresse?.latitude);
  const rawLongitude = parseNumber(boutique.adresse?.longitude);
  if (rawLatitude === undefined || rawLongitude === undefined) return undefined;

  const appearsSwapped =
    Math.abs(rawLatitude) <= 20 && Math.abs(rawLongitude) > 20 && Math.abs(rawLongitude) <= 90;
  if (appearsSwapped) {
    warnings.push(
      `Les coordonnées de l’établissement ${boutique.nom_boutique} semblent inversées et doivent être validées.`
    );
    return { latitude: rawLongitude, longitude: rawLatitude, requiresReview: true };
  }
  return {
    latitude: rawLatitude,
    longitude: rawLongitude,
    requiresReview: false
  };
}

function normalizeDeliveryArea(
  boutique: BoutiqueApi,
  warnings: string[]
): Array<[number, number]> | undefined {
  if (!boutique.geo_area) return undefined;
  try {
    const result = deliveryAreaSchema.safeParse(JSON.parse(boutique.geo_area));
    if (result.success) return result.data;
  } catch {
    // A warning below keeps this page failure partial.
  }
  warnings.push(
    `La zone de livraison de l’établissement ${boutique.nom_boutique} n’a pas pu être validée.`
  );
  return undefined;
}

function normalizeEstablishment(
  boutique: BoutiqueApi,
  sourceUrl: string,
  retrievedAt: string,
  index: number,
  warnings: string[]
): ImportedEstablishment {
  const streetParts = [boutique.adresse?.num_rue, boutique.adresse?.rue].filter(
    (value): value is string => Boolean(value)
  );
  const street = streetParts.length ? streetParts.join(" ") : undefined;
  const hasAddress = Boolean(
    street ||
    boutique.adresse?.code_postal ||
    boutique.adresse?.ville ||
    boutique.adresse?.pays ||
    boutique.adresse?.designation
  );
  const coordinates = normalizeCoordinates(boutique, warnings);
  const deliveryArea = normalizeDeliveryArea(boutique, warnings);

  return {
    sourceId: String(boutique.id),
    name: boutique.nom_boutique,
    ...(boutique.tel ? { phone: boutique.tel } : {}),
    ...(hasAddress
      ? {
          address: {
            ...(street ? { street } : {}),
            ...(boutique.adresse?.code_postal ? { postalCode: boutique.adresse.code_postal } : {}),
            ...(boutique.adresse?.ville ? { city: boutique.adresse.ville } : {}),
            ...(boutique.adresse?.pays ? { country: boutique.adresse.pays } : {}),
            ...(boutique.adresse?.designation ? { formatted: boutique.adresse.designation } : {})
          }
        }
      : {}),
    ...(coordinates ? { coordinates } : {}),
    ...(deliveryArea ? { deliveryArea } : {}),
    source: sourceReference(sourceUrl, retrievedAt, 0.95, {
      jsonPointer: `/model/${index}`,
      ...(boutique.updated_at ? { sourceModifiedAt: boutique.updated_at } : {})
    })
  };
}

function normalizeCategory(
  family: FamilyApi,
  sourceUrl: string,
  retrievedAt: string,
  index: number
): ImportedCategory {
  return {
    sourceId: String(family.id),
    name: family.lib_famille,
    ...(family.titre ? { title: family.titre } : {}),
    ...(family.description ? { description: family.description } : {}),
    ...(family.index !== null && family.index !== undefined ? { order: family.index } : {}),
    source: sourceReference(sourceUrl, retrievedAt, 0.95, {
      jsonPointer: `/model/${index}`,
      ...(family.updated_at ? { sourceModifiedAt: family.updated_at } : {})
    })
  };
}

function resolveApiMedia(
  rawUrl: string | null | undefined,
  sourceUrl: string,
  sourceKind: "API_CATEGORY" | "API_PRODUCT",
  context: string
): DiscoveredMedia | undefined {
  if (!rawUrl) return undefined;
  try {
    const url = /^https?:\/\//i.test(rawUrl)
      ? new URL(rawUrl)
      : new URL(`/${rawUrl.replace(/^\/+/, "")}`, new URL(sourceUrl).origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    const allowedForDownload = isExactAllowedHttpsUrl(url, YOKOSUSHI_ALLOWED_HOSTS);
    return {
      url: url.href,
      pageUrl: sourceUrl,
      sourceKind,
      allowedForDownload,
      isExternal: !allowedForDownload,
      categoryHint: sourceKind === "API_PRODUCT" ? "PRODUCT" : "UNCLASSIFIED",
      context
    };
  } catch {
    return undefined;
  }
}

function isHiddenProduct(product: ProductApi): boolean {
  return product.cacher === true || product.cacher === 1 || Boolean(product.deleted_at);
}

function normalizeProduct(
  product: ProductApi,
  sourceUrl: string,
  retrievedAt: string,
  index: number
): ImportedProduct {
  const media = resolveApiMedia(product.photo, sourceUrl, "API_PRODUCT", product.designation);
  return {
    sourceId: String(product.id),
    categorySourceId: String(product.famille_id),
    name: product.designation,
    ...(product.description ? { description: product.description } : {}),
    ...(product.piece ? { unit: product.piece } : {}),
    price: product.prix,
    ...(product.effective_prix_promo !== null && product.effective_prix_promo !== undefined
      ? { promotionalPrice: product.effective_prix_promo }
      : {}),
    // The public field is named `composants`, not allergens. Treating ingredients or component
    // groups as legally meaningful allergen declarations would invent a fact the site did not
    // explicitly publish.
    allergens: [],
    ...(media ? { mediaUrl: media.url } : {}),
    badges: [...new Set(product.offer_badges)],
    establishmentIds: [],
    establishmentAssociation: "BRAND_LEVEL_REQUIRES_REVIEW",
    source: sourceReference(sourceUrl, retrievedAt, 0.95, {
      jsonPointer: `/model/produits/${index}`,
      ...(product.updated_at ? { sourceModifiedAt: product.updated_at } : {})
    })
  };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = Array<R>(values.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value === undefined) continue;
      results[index] = await worker(value, index);
    }
  });
  await Promise.all(runners);
  return results;
}

function toCrawlError(error: unknown, fallbackUrl: string, stage: CrawlError["stage"]): CrawlError {
  if (error instanceof CrawlerHttpError) {
    return {
      url: error.url,
      stage,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.statusCode !== undefined ? { statusCode: error.statusCode } : {})
    };
  }
  if (error instanceof UrlSecurityError) {
    return {
      url: error.url,
      stage,
      code: error.code,
      message: error.message,
      retryable: false
    };
  }
  if (error instanceof CrawlerDataError) {
    return {
      url: error.url,
      stage,
      code: error.code,
      message: error.message,
      retryable: false
    };
  }
  return {
    url: fallbackUrl,
    stage,
    code: "UNEXPECTED_IMPORT_ERROR",
    message: "Cette ressource n’a pas pu être analysée.",
    retryable: false
  };
}

function deduplicateMedia(media: readonly DiscoveredMedia[]): DiscoveredMedia[] {
  return [...new Map(media.map((candidate) => [candidate.url, candidate])).values()];
}

function deduplicateLinks(links: readonly DiscoveredLink[]): DiscoveredLink[] {
  return [...new Map(links.map((link) => [link.url, link])).values()];
}

function contentLooksLikeHtml(response: SafeHttpResponse): boolean {
  return (
    response.contentType.toLowerCase().includes("text/html") ||
    /^\s*<(?:!doctype\s+html|html)\b/i.test(response.body)
  );
}

interface FamilyOutcome {
  products: ImportedProduct[];
  media: DiscoveredMedia[];
  hiddenProductsSkipped: number;
  unverifiedComponentsFound: boolean;
  errors: CrawlError[];
}

export class YokoSushiHttpCrawlerProvider implements WebsiteCrawlerProvider {
  readonly name = "yokosushi-http";

  constructor(private readonly dependencies: HttpCrawlerDependencies = {}) {}

  async crawl(input: WebsiteCrawlInput): Promise<WebsiteCrawlResult> {
    const options: CrawlerOptions = crawlerOptionsSchema.parse(input.options ?? {});
    const now = this.dependencies.now ?? (() => new Date());
    const startedAt = now().toISOString();
    const errors: CrawlError[] = [];
    const warnings: string[] = [];
    const pages: CrawledPage[] = [];
    const establishments: ImportedEstablishment[] = [];
    const categories: ImportedCategory[] = [];
    const products: ImportedProduct[] = [];
    const media: DiscoveredMedia[] = [];
    const externalLinks: DiscoveredLink[] = [];
    let hiddenProductsSkipped = 0;
    let baseUrl: URL;

    try {
      baseUrl = new URL(input.websiteUrl);
      baseUrl.pathname = "/";
      baseUrl.search = "";
      baseUrl.hash = "";
    } catch {
      baseUrl = new URL("https://www.yokosushi.fr/");
      errors.push({
        url: input.websiteUrl,
        stage: "CONNECTING",
        code: "INVALID_URL",
        message: "L’URL du site est invalide.",
        retryable: false
      });
      return this.finishResult({
        input,
        baseUrl,
        startedAt,
        errors,
        warnings,
        pages,
        establishments,
        categories,
        products,
        media,
        externalLinks,
        hiddenProductsSkipped,
        robots: { url: new URL("/robots.txt", baseUrl).href, fetched: false, disallowedPaths: [] },
        now
      });
    }

    const securityPolicy = this.dependencies.dnsResolver
      ? new UrlSecurityPolicy(YOKOSUSHI_ALLOWED_HOSTS, this.dependencies.dnsResolver)
      : new UrlSecurityPolicy(YOKOSUSHI_ALLOWED_HOSTS);
    const client = new SsrfSafeHttpClient(
      securityPolicy,
      options,
      this.dependencies.fetcher,
      this.dependencies.sleep,
      () => now().getTime()
    );

    await this.emitProgress(input, "CONNECTING", "Connexion au site", 0);
    try {
      await securityPolicy.assertSafe(baseUrl);
    } catch (error) {
      errors.push(toCrawlError(error, baseUrl.href, "CONNECTING"));
      return this.finishResult({
        input,
        baseUrl,
        startedAt,
        errors,
        warnings,
        pages,
        establishments,
        categories,
        products,
        media,
        externalLinks,
        hiddenProductsSkipped,
        robots: { url: new URL("/robots.txt", baseUrl).href, fetched: false, disallowedPaths: [] },
        now
      });
    }

    const robotsUrl = new URL("/robots.txt", baseUrl).href;
    let robotsPolicy: ParsedRobots = parseRobotsTxt("", options.userAgent);
    let robotsFetched = false;
    try {
      const response = await client.getText(robotsUrl, {
        accept: "text/plain",
        maxBytes: 256_000,
        ...(input.signal ? { signal: input.signal } : {})
      });
      robotsPolicy = parseRobotsTxt(response.body, options.userAgent);
      robotsFetched = true;
    } catch (error) {
      errors.push(toCrawlError(error, robotsUrl, "ROBOTS"));
      warnings.push(
        "Le fichier robots.txt n’a pas pu être lu ; seules les routes publiques connues seront utilisées."
      );
    }

    await this.emitProgress(input, "DETECTING_ESTABLISHMENTS", "Détection des restaurants", 0);
    const boutiquesUrl = new URL("/api/boutique", baseUrl).href;
    if (robotsPolicy.isAllowed(boutiquesUrl)) {
      try {
        const response = await client.getText(boutiquesUrl, {
          accept: "application/json",
          ...(input.signal ? { signal: input.signal } : {})
        });
        const data = parseJsonResponse(response, boutiquesResponseSchema);
        data.model.forEach((boutique, index) => {
          establishments.push(
            normalizeEstablishment(
              boutique,
              response.finalUrl,
              now().toISOString(),
              index,
              warnings
            )
          );
        });
      } catch (error) {
        errors.push(toCrawlError(error, boutiquesUrl, "API"));
      }
    } else {
      warnings.push("robots.txt interdit la route des établissements ; elle a été ignorée.");
    }

    await this.emitProgress(input, "DETECTING_PRODUCTS", "Détection des produits", 0);
    const familiesUrl = new URL("/api/famille", baseUrl).href;
    let families: FamilyApi[] = [];
    if (robotsPolicy.isAllowed(familiesUrl)) {
      try {
        const response = await client.getText(familiesUrl, {
          accept: "application/json",
          ...(input.signal ? { signal: input.signal } : {})
        });
        const data = parseJsonResponse(response, familiesResponseSchema);
        families = data.model.slice(0, options.maxFamilies);
        families.forEach((family, index) => {
          categories.push(normalizeCategory(family, response.finalUrl, now().toISOString(), index));
          const familyMedia = resolveApiMedia(
            family.photo,
            response.finalUrl,
            "API_CATEGORY",
            family.lib_famille
          );
          if (familyMedia) media.push(familyMedia);
        });
        if (data.model.length > options.maxFamilies) {
          warnings.push(
            `${data.model.length - options.maxFamilies} catégories ont été ignorées à cause de la limite configurée.`
          );
        }
      } catch (error) {
        errors.push(toCrawlError(error, familiesUrl, "API"));
      }
    } else {
      warnings.push("robots.txt interdit la route des catégories ; elle a été ignorée.");
    }

    const familyOutcomes = await mapWithConcurrency(
      families,
      options.concurrency,
      async (family): Promise<FamilyOutcome> => {
        const detailUrl = new URL(`/api/famille/${family.id}`, baseUrl).href;
        if (!robotsPolicy.isAllowed(detailUrl)) {
          return {
            products: [],
            media: [],
            hiddenProductsSkipped: 0,
            unverifiedComponentsFound: false,
            errors: []
          };
        }
        try {
          const response = await client.getText(detailUrl, {
            accept: "application/json",
            ...(input.signal ? { signal: input.signal } : {})
          });
          const data = parseJsonResponse(response, familyDetailResponseSchema);
          const normalizedProducts: ImportedProduct[] = [];
          const productMedia: DiscoveredMedia[] = [];
          let skipped = 0;
          let unverifiedComponentsFound = false;
          data.model.produits.forEach((product, index) => {
            if (isHiddenProduct(product)) {
              skipped += 1;
              return;
            }
            if (product.composants.length > 0) unverifiedComponentsFound = true;
            normalizedProducts.push(
              normalizeProduct(product, response.finalUrl, now().toISOString(), index)
            );
            const candidate = resolveApiMedia(
              product.photo,
              response.finalUrl,
              "API_PRODUCT",
              product.designation
            );
            if (candidate) productMedia.push(candidate);
          });
          return {
            products: normalizedProducts,
            media: productMedia,
            hiddenProductsSkipped: skipped,
            unverifiedComponentsFound,
            errors: []
          };
        } catch (error) {
          return {
            products: [],
            media: [],
            hiddenProductsSkipped: 0,
            unverifiedComponentsFound: false,
            errors: [toCrawlError(error, detailUrl, "API")]
          };
        }
      }
    );
    for (const outcome of familyOutcomes) {
      products.push(...outcome.products);
      media.push(...outcome.media);
      hiddenProductsSkipped += outcome.hiddenProductsSkipped;
      errors.push(...outcome.errors);
    }
    if (familyOutcomes.some((outcome) => outcome.unverifiedComponentsFound)) {
      warnings.push(
        "Les champs « composants » de l’API ne sont pas des déclarations explicites d’allergènes et n’ont pas été importés comme tels."
      );
    }
    if (products.length > 0) {
      warnings.push(
        "Les produits ne précisent pas leur établissement dans l’API et restent associés à la marque jusqu’à validation."
      );
    }

    await this.emitProgress(input, "SCANNING_PAGES", "Analyse des pages", 0);
    const queue = [
      canonicalizePageUrl(baseUrl.href),
      canonicalizePageUrl(new URL("/sitemap", baseUrl).href)
    ];
    const visited = new Set<string>();
    const queued = new Set(queue);
    const stylesheetUrls = new Set<string>();
    let attemptedPages = 0;

    // maxPages is a hard network budget, not a target number of successful responses. A page
    // containing many broken internal links must never turn a small crawl into an unbounded burst.
    while (queue.length > 0 && attemptedPages < options.maxPages) {
      const pageUrl = queue.shift();
      if (!pageUrl || visited.has(pageUrl)) continue;
      visited.add(pageUrl);
      if (!robotsPolicy.isAllowed(pageUrl)) {
        warnings.push(`La page ${new URL(pageUrl).pathname} est interdite par robots.txt.`);
        continue;
      }
      attemptedPages += 1;
      try {
        const response = await client.getText(pageUrl, {
          accept: "text/html",
          ...(input.signal ? { signal: input.signal } : {})
        });
        if (!contentLooksLikeHtml(response)) {
          throw new CrawlerDataError(
            "UNEXPECTED_CONTENT_TYPE",
            "La ressource n’est pas une page HTML.",
            response.finalUrl
          );
        }
        const extracted = extractHtmlContent(
          response.body,
          response.finalUrl,
          YOKOSUSHI_ALLOWED_HOSTS
        );
        warnings.push(...extracted.warnings.map((warning) => `${response.finalUrl}: ${warning}`));
        pages.push({
          url: response.finalUrl,
          statusCode: response.statusCode,
          ...(extracted.title ? { title: extracted.title } : {}),
          ...(extracted.description ? { description: extracted.description } : {}),
          ...(response.lastModified ? { sourceModifiedAt: response.lastModified } : {}),
          openGraph: extracted.openGraph,
          jsonLd: extracted.jsonLd,
          links: extracted.links,
          media: extracted.media,
          stylesheetUrls: extracted.stylesheetUrls
        });
        media.push(...extracted.media);
        externalLinks.push(...extracted.links.filter((link) => link.isExternal));

        for (const stylesheetUrl of extracted.stylesheetUrls) {
          if (securityPolicy.isAllowedHost(stylesheetUrl)) stylesheetUrls.add(stylesheetUrl);
        }
        for (const link of extracted.links) {
          if (link.isExternal || !securityPolicy.isAllowedHost(link.url)) continue;
          const candidate = new URL(link.url);
          if (!isLikelyPublicHtmlPage(candidate)) continue;
          const canonical = canonicalizePageUrl(candidate.href);
          if (!queued.has(canonical) && !visited.has(canonical)) {
            queue.push(canonical);
            queued.add(canonical);
          }
        }
      } catch (error) {
        errors.push(toCrawlError(error, pageUrl, "SCANNING_PAGES"));
      }
      await this.emitProgress(
        input,
        "SCANNING_PAGES",
        "Analyse des pages",
        attemptedPages,
        options.maxPages
      );
    }
    if (queue.length > 0) {
      warnings.push("Certaines pages ont été ignorées à cause de la limite maximale de pages.");
    }

    await this.emitProgress(input, "DETECTING_IMAGES", "Détection des images", 0);
    const cssToFetch = [...stylesheetUrls].slice(0, options.maxStylesheets);
    for (const stylesheetUrl of cssToFetch) {
      if (!robotsPolicy.isAllowed(stylesheetUrl)) continue;
      try {
        const response = await client.getText(stylesheetUrl, {
          accept: "text/css",
          maxBytes: options.maxCssBytes,
          ...(input.signal ? { signal: input.signal } : {})
        });
        media.push(
          ...extractCssMedia(
            response.body,
            response.finalUrl,
            response.finalUrl,
            YOKOSUSHI_ALLOWED_HOSTS
          )
        );
      } catch (error) {
        errors.push(toCrawlError(error, stylesheetUrl, "CSS"));
      }
    }
    if (stylesheetUrls.size > options.maxStylesheets) {
      warnings.push(
        "Certaines feuilles de style ont été ignorées à cause de la limite configurée."
      );
    }

    await this.emitProgress(input, "PREPARING_PREVIEW", "Préparation de l’aperçu", 1, 1);
    return this.finishResult({
      input,
      baseUrl,
      startedAt,
      errors,
      warnings,
      pages,
      establishments,
      categories,
      products: [...new Map(products.map((product) => [product.sourceId, product])).values()],
      media: deduplicateMedia(media),
      externalLinks: deduplicateLinks(externalLinks),
      hiddenProductsSkipped,
      robots: {
        url: robotsUrl,
        fetched: robotsFetched,
        disallowedPaths: robotsPolicy.disallowedPaths
      },
      now
    });
  }

  private async emitProgress(
    input: WebsiteCrawlInput,
    stage: Parameters<NonNullable<WebsiteCrawlInput["onProgress"]>>[0]["stage"],
    message: string,
    completed: number,
    total?: number
  ): Promise<void> {
    if (!input.onProgress) return;
    await input.onProgress({
      stage,
      message,
      completed,
      ...(total !== undefined ? { total } : {})
    });
  }

  private finishResult(context: {
    input: WebsiteCrawlInput;
    baseUrl: URL;
    startedAt: string;
    errors: CrawlError[];
    warnings: string[];
    pages: CrawledPage[];
    establishments: ImportedEstablishment[];
    categories: ImportedCategory[];
    products: ImportedProduct[];
    media: DiscoveredMedia[];
    externalLinks: DiscoveredLink[];
    hiddenProductsSkipped: number;
    robots: WebsiteCrawlResult["robots"];
    now: () => Date;
  }): WebsiteCrawlResult {
    const hasImportedContent =
      context.pages.length > 0 ||
      context.establishments.length > 0 ||
      context.categories.length > 0 ||
      context.products.length > 0;
    const status = !hasImportedContent
      ? "FAILED"
      : context.errors.length > 0
        ? "PARTIALLY_COMPLETED"
        : "COMPLETED";
    return {
      provider: "yokosushi-http",
      isDemo: false,
      status,
      websiteUrl: context.baseUrl.href,
      startedAt: context.startedAt,
      completedAt: context.now().toISOString(),
      robots: context.robots,
      pages: context.pages,
      establishments: context.establishments,
      categories: context.categories,
      products: context.products,
      media: context.media,
      externalLinks: context.externalLinks,
      warnings: context.warnings,
      errors: context.errors,
      statistics: {
        pagesScanned: context.pages.length,
        establishmentsDetected: context.establishments.length,
        categoriesDetected: context.categories.length,
        productsDetected: context.products.length,
        hiddenProductsSkipped: context.hiddenProductsSkipped,
        imagesDetected: context.media.length,
        externalImagesDetected: context.media.filter((candidate) => candidate.isExternal).length,
        warningsCount: context.warnings.length,
        errorsCount: context.errors.length
      }
    };
  }
}
