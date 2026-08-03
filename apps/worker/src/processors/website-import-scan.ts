import { createHash } from "node:crypto";

import type { MediaIngestJobPayload, WebsiteImportScanJobPayload } from "@yokosocial/shared";
import {
  YOKOSUSHI_ALLOWED_HOSTS,
  type CrawlProgress,
  type DiscoveredMedia,
  type WebsiteCrawlerProvider,
  type WebsiteCrawlResult
} from "@yokosocial/website-importer";

export type WebsiteImportRecord = {
  id: string;
  organizationId: string;
  brandId: string;
  websiteUrl: string;
  status:
    | "PENDING"
    | "CRAWLING"
    | "ANALYZING"
    | "WAITING_FOR_REVIEW"
    | "IMPORTING"
    | "COMPLETED"
    | "PARTIALLY_COMPLETED"
    | "FAILED"
    | "CANCELLED";
  updatedAt: Date;
  errorMessage: string | null;
};

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type PreparedPage = {
  sourceUrl: string;
  canonicalUrl: string;
  pageType:
    | "HOME"
    | "MENU"
    | "CATEGORY"
    | "PRODUCT"
    | "ESTABLISHMENT"
    | "CONTACT"
    | "ORDER"
    | "PROMOTION"
    | "SITEMAP"
    | "OTHER";
  status: "ANALYZED" | "PARTIAL" | "FAILED";
  httpStatus?: number;
  fetchedAt?: Date;
  analyzedAt: Date;
  sourceLastModifiedAt?: Date;
  errorCode?: string;
  internalError?: string;
  metadata: JsonValue;
};

export type PreparedImportedData = {
  type:
    | "ESTABLISHMENT"
    | "ADDRESS"
    | "PHONE"
    | "PRODUCT_CATEGORY"
    | "PRODUCT"
    | "PRICE"
    | "ALLERGEN"
    | "OTHER";
  key: string;
  value: JsonValue;
  normalizedValue?: string;
  sourceUrl: string;
  confidence: number;
  critical: boolean;
  retrievedAt: Date;
  sourceLastModifiedAt?: Date;
  fingerprint: string;
  establishmentSourceId?: string;
};

export type DetectedEstablishmentShell = {
  sourceId: string;
  name: string;
  slug: string;
  sourceUrl: string;
};

export type DetectedCategoryShell = {
  sourceId: string;
  name: string;
  slug: string;
  description?: string;
  sourceUrl: string;
  sortOrder: number;
};

export type DetectedProductShell = {
  sourceId: string;
  categorySourceId: string;
  name: string;
  slug: string;
  description?: string;
  sourceUrl: string;
  confidence: number;
  sourceLastModifiedAt?: Date;
};

export type WebsiteImportPersistencePlan = {
  importRecord: WebsiteImportRecord;
  finalStatus: "PARTIALLY_COMPLETED" | "FAILED";
  startedAt: Date;
  completedAt: Date;
  pages: PreparedPage[];
  importedData: PreparedImportedData[];
  establishments: DetectedEstablishmentShell[];
  categories: DetectedCategoryShell[];
  products: DetectedProductShell[];
  mediaJobs: MediaIngestJobPayload[];
  statistics: {
    pagesDetected: number;
    pagesScanned: number;
    productsDetected: number;
    categoriesDetected: number;
    imagesDetected: number;
    warningsCount: number;
    errorsCount: number;
  };
  errorMessage?: string;
};

export interface WebsiteImportScanRepository {
  findByTenant: (input: {
    importId: string;
    organizationId: string;
  }) => Promise<WebsiteImportRecord | null>;
  claimForScan: (input: {
    importId: string;
    organizationId: string;
    startedAt: Date;
    staleBefore: Date;
  }) => Promise<boolean>;
  updateProgress: (input: {
    importId: string;
    organizationId: string;
    status: "CRAWLING" | "ANALYZING";
    pagesScanned?: number;
  }) => Promise<void>;
  persistScan: (plan: WebsiteImportPersistencePlan) => Promise<void>;
  findPendingMediaJobs: (input: {
    importId: string;
    organizationId: string;
    actorId: string;
  }) => Promise<MediaIngestJobPayload[]>;
  markMediaDispatchPending: (input: { importId: string; organizationId: string }) => Promise<void>;
  markMediaDispatchReady: (input: { importId: string; organizationId: string }) => Promise<void>;
  markFailed: (input: {
    importId: string;
    organizationId: string;
    completedAt: Date;
    errorMessage: string;
  }) => Promise<void>;
}

export interface MediaIngestJobPublisher {
  publish: (payload: MediaIngestJobPayload) => Promise<void>;
}

export type WebsiteImportScanOutcome = {
  status: "WAITING_FOR_REVIEW" | "FAILED" | "ALREADY_PROCESSED" | "ALREADY_RUNNING";
  importId: string;
  pagesPersisted: number;
  importedDataPersisted: number;
  mediaJobsPrepared: number;
  mediaJobsPublished: number;
  mediaJobPublishErrors: number;
};

export type WebsiteImportScanProcessorOptions = {
  crawlerOptions?: Parameters<WebsiteCrawlerProvider["crawl"]>[0]["options"];
  runningLeaseMs?: number;
  now?: () => Date;
};

const terminalStatuses = new Set<WebsiteImportRecord["status"]>([
  "WAITING_FOR_REVIEW",
  "IMPORTING",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "CANCELLED"
]);

const criticalDataTypes = new Set<PreparedImportedData["type"]>([
  "ADDRESS",
  "PHONE",
  "PRICE",
  "ALLERGEN"
]);

export class WebsiteImportNotFoundError extends Error {
  constructor() {
    super("Import de site introuvable pour cette organisation.");
    this.name = "WebsiteImportNotFoundError";
  }
}

export class WebsiteImportScanError extends Error {
  constructor() {
    super("L’analyse du site a échoué. Une nouvelle tentative peut être lancée.");
    this.name = "WebsiteImportScanError";
  }
}

export class WebsiteImportMediaDispatchError extends WebsiteImportScanError {
  readonly retryable = true;

  constructor(
    readonly mediaJobsPublished: number,
    readonly mediaJobPublishErrors: number,
    readonly code = "MEDIA_JOB_DISPATCH_FAILED"
  ) {
    super();
    this.name = "WebsiteImportMediaDispatchError";
  }
}

export const MEDIA_DISPATCH_PENDING_MESSAGE =
  "La mise en file des médias est incomplète. Une reprise automatique est en cours.";

export function mediaIngestBullJobId(payload: MediaIngestJobPayload): string {
  if (!/^[a-zA-Z0-9_-]{1,200}$/u.test(payload.idempotencyKey)) {
    throw new Error("Identifiant BullMQ média invalide.");
  }
  return payload.idempotencyKey;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

function fingerprint(type: string, key: string, sourceUrl: string, value: JsonValue): string {
  return createHash("sha256")
    .update(`${type}\u0000${key}\u0000${sourceUrl}\u0000${canonicalJson(value)}`)
    .digest("hex");
}

function stableSlug(prefix: string, sourceId: string): string {
  const normalized = sourceId
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const fallback = createHash("sha256").update(sourceId).digest("hex").slice(0, 16);
  return `${prefix}-${normalized || fallback}`;
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function isAllowedSourceUrl(rawUrl: string, requireHttps = false): boolean {
  try {
    const url = new URL(rawUrl);
    const protocolAllowed = requireHttps
      ? url.protocol === "https:"
      : url.protocol === "https:" || url.protocol === "http:";
    return (
      protocolAllowed &&
      !url.username &&
      !url.password &&
      (YOKOSUSHI_ALLOWED_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function sanitizeQueueUrl(rawUrl: string): string | undefined {
  if (!isAllowedSourceUrl(rawUrl, true)) return undefined;
  const url = new URL(rawUrl);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.href;
}

function canonicalSourceUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    return url.href;
  } catch {
    return rawUrl;
  }
}

function pageTypeForUrl(url: string): PreparedPage["pageType"] {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname === "/") return "HOME";
  if (pathname.includes("sitemap")) return "SITEMAP";
  if (pathname.includes("boutique") || pathname.includes("restaurant")) return "ESTABLISHMENT";
  if (pathname.includes("contact")) return "CONTACT";
  if (pathname.includes("commande") || pathname.includes("order")) return "ORDER";
  if (pathname.includes("promotion") || pathname.includes("actualite")) return "PROMOTION";
  if (/\/api\/famille\/[^/]+/.test(pathname) || pathname.includes("produit")) return "PRODUCT";
  if (pathname.includes("famille") || pathname.includes("categorie")) return "CATEGORY";
  if (pathname.includes("carte") || pathname.includes("menu")) return "MENU";
  return "OTHER";
}

function sourceMetadata(result: WebsiteCrawlResult, sourceUrl: string): JsonValue {
  const establishment = result.establishments.some((item) => item.source.sourceUrl === sourceUrl);
  const category = result.categories.some((item) => item.source.sourceUrl === sourceUrl);
  const product = result.products.some((item) => item.source.sourceUrl === sourceUrl);
  return {
    sourceKind: "API_OR_DISCOVERED_RESOURCE",
    establishment,
    category,
    product
  };
}

function preparePages(result: WebsiteCrawlResult, analyzedAt: Date): PreparedPage[] {
  const pages = new Map<string, PreparedPage>();

  for (const page of result.pages) {
    if (!isAllowedSourceUrl(page.url)) continue;
    const sourceUrl = canonicalSourceUrl(page.url);
    const sourceLastModifiedAt = parseDate(page.sourceModifiedAt);
    pages.set(sourceUrl, {
      sourceUrl,
      canonicalUrl: sourceUrl,
      pageType: pageTypeForUrl(sourceUrl),
      status: "ANALYZED",
      httpStatus: page.statusCode,
      fetchedAt: analyzedAt,
      analyzedAt,
      ...(sourceLastModifiedAt ? { sourceLastModifiedAt } : {}),
      metadata: toJsonValue({
        title: page.title ?? null,
        description: page.description ?? null,
        openGraph: page.openGraph,
        jsonLd: page.jsonLd,
        links: page.links,
        mediaDetected: page.media.length,
        stylesheetUrls: page.stylesheetUrls
      })
    });
  }

  const referencedUrls = new Set([
    ...result.establishments.map((item) => item.source.sourceUrl),
    ...result.categories.map((item) => item.source.sourceUrl),
    ...result.products.map((item) => item.source.sourceUrl),
    ...result.media.map((item) => item.pageUrl)
  ]);
  for (const rawUrl of referencedUrls) {
    if (!isAllowedSourceUrl(rawUrl)) continue;
    const sourceUrl = canonicalSourceUrl(rawUrl);
    if (pages.has(sourceUrl)) continue;
    pages.set(sourceUrl, {
      sourceUrl,
      canonicalUrl: sourceUrl,
      pageType: pageTypeForUrl(sourceUrl),
      status: "ANALYZED",
      analyzedAt,
      metadata: sourceMetadata(result, rawUrl)
    });
  }

  for (const error of result.errors) {
    if (!isAllowedSourceUrl(error.url)) continue;
    const sourceUrl = canonicalSourceUrl(error.url);
    const existing = pages.get(sourceUrl);
    if (existing) {
      pages.set(sourceUrl, {
        ...existing,
        status: "PARTIAL",
        errorCode: error.code,
        internalError: error.message,
        ...(error.statusCode !== undefined ? { httpStatus: error.statusCode } : {})
      });
      continue;
    }
    pages.set(sourceUrl, {
      sourceUrl,
      canonicalUrl: sourceUrl,
      pageType: pageTypeForUrl(sourceUrl),
      status: "FAILED",
      analyzedAt,
      errorCode: error.code,
      internalError: error.message,
      ...(error.statusCode !== undefined ? { httpStatus: error.statusCode } : {}),
      metadata: { stage: error.stage, retryable: error.retryable }
    });
  }

  return [...pages.values()];
}

function importedDataEntry(
  entry: Omit<PreparedImportedData, "critical" | "fingerprint"> & { critical?: boolean }
): PreparedImportedData {
  const critical = entry.critical ?? criticalDataTypes.has(entry.type);
  return {
    ...entry,
    critical,
    fingerprint: fingerprint(entry.type, entry.key, entry.sourceUrl, entry.value)
  };
}

function prepareImportedData(result: WebsiteCrawlResult): PreparedImportedData[] {
  const data: PreparedImportedData[] = [];

  for (const establishment of result.establishments) {
    if (!isAllowedSourceUrl(establishment.source.sourceUrl)) continue;
    const retrievedAt = parseDate(establishment.source.retrievedAt) ?? new Date(result.completedAt);
    const sourceLastModifiedAt = parseDate(establishment.source.sourceModifiedAt);
    data.push(
      importedDataEntry({
        type: "ESTABLISHMENT",
        key: `establishment:${establishment.sourceId}`,
        value: { sourceId: establishment.sourceId, name: establishment.name },
        normalizedValue: establishment.name,
        sourceUrl: establishment.source.sourceUrl,
        confidence: establishment.source.confidence,
        retrievedAt,
        ...(sourceLastModifiedAt ? { sourceLastModifiedAt } : {}),
        establishmentSourceId: establishment.sourceId
      })
    );
    if (establishment.address || establishment.coordinates || establishment.deliveryArea) {
      const addressValue = toJsonValue({
        address: establishment.address ?? null,
        coordinates: establishment.coordinates ?? null,
        deliveryArea: establishment.deliveryArea ?? null
      });
      data.push(
        importedDataEntry({
          type: "ADDRESS",
          key: `establishment:${establishment.sourceId}:address`,
          value: addressValue,
          ...(establishment.address?.formatted
            ? { normalizedValue: establishment.address.formatted }
            : {}),
          sourceUrl: establishment.source.sourceUrl,
          confidence: establishment.source.confidence,
          critical: true,
          retrievedAt,
          ...(sourceLastModifiedAt ? { sourceLastModifiedAt } : {}),
          establishmentSourceId: establishment.sourceId
        })
      );
    }
    if (establishment.phone) {
      data.push(
        importedDataEntry({
          type: "PHONE",
          key: `establishment:${establishment.sourceId}:phone`,
          value: establishment.phone,
          normalizedValue: establishment.phone,
          sourceUrl: establishment.source.sourceUrl,
          confidence: establishment.source.confidence,
          critical: true,
          retrievedAt,
          ...(sourceLastModifiedAt ? { sourceLastModifiedAt } : {}),
          establishmentSourceId: establishment.sourceId
        })
      );
    }
  }

  for (const category of result.categories) {
    if (!isAllowedSourceUrl(category.source.sourceUrl)) continue;
    const value = toJsonValue({
      sourceId: category.sourceId,
      name: category.name,
      title: category.title ?? null,
      description: category.description ?? null,
      order: category.order ?? null
    });
    const sourceLastModifiedAt = parseDate(category.source.sourceModifiedAt);
    data.push(
      importedDataEntry({
        type: "PRODUCT_CATEGORY",
        key: `category:${category.sourceId}`,
        value,
        normalizedValue: category.name,
        sourceUrl: category.source.sourceUrl,
        confidence: category.source.confidence,
        retrievedAt: parseDate(category.source.retrievedAt) ?? new Date(result.completedAt),
        ...(sourceLastModifiedAt ? { sourceLastModifiedAt } : {})
      })
    );
  }

  for (const product of result.products) {
    if (!isAllowedSourceUrl(product.source.sourceUrl)) continue;
    const retrievedAt = parseDate(product.source.retrievedAt) ?? new Date(result.completedAt);
    const sourceLastModifiedAt = parseDate(product.source.sourceModifiedAt);
    data.push(
      importedDataEntry({
        type: "PRODUCT",
        key: `product:${product.sourceId}`,
        value: toJsonValue({
          sourceId: product.sourceId,
          categorySourceId: product.categorySourceId,
          name: product.name,
          description: product.description ?? null,
          unit: product.unit ?? null,
          badges: product.badges,
          establishmentIds: product.establishmentIds,
          establishmentAssociation: product.establishmentAssociation
        }),
        normalizedValue: product.name,
        sourceUrl: product.source.sourceUrl,
        confidence: product.source.confidence,
        retrievedAt,
        ...(sourceLastModifiedAt ? { sourceLastModifiedAt } : {})
      }),
      importedDataEntry({
        type: "PRICE",
        key: `product:${product.sourceId}:price`,
        value: {
          price: product.price,
          promotionalPrice: product.promotionalPrice ?? null,
          currency: "EUR"
        },
        normalizedValue: product.price.toFixed(2),
        sourceUrl: product.source.sourceUrl,
        confidence: product.source.confidence,
        critical: true,
        retrievedAt,
        ...(sourceLastModifiedAt ? { sourceLastModifiedAt } : {})
      })
    );
    if (product.allergens.length > 0) {
      data.push(
        importedDataEntry({
          type: "ALLERGEN",
          key: `product:${product.sourceId}:allergens`,
          value: product.allergens,
          normalizedValue: product.allergens.join(", "),
          sourceUrl: product.source.sourceUrl,
          confidence: product.source.confidence,
          critical: true,
          retrievedAt,
          ...(sourceLastModifiedAt ? { sourceLastModifiedAt } : {})
        })
      );
    }
  }

  return data;
}

function prepareMediaJobs(
  result: WebsiteCrawlResult,
  context: Pick<WebsiteImportScanJobPayload, "organizationId" | "actorId"> & {
    websiteImportId: string;
    brandId: string;
  }
): MediaIngestJobPayload[] {
  const jobs = new Map<string, MediaIngestJobPayload>();
  for (const media of result.media) {
    const payload = prepareMediaJob(media, context);
    if (payload) jobs.set(payload.sourceUrl, payload);
  }
  return [...jobs.values()];
}

function prepareMediaImportedData(
  result: WebsiteCrawlResult,
  jobs: readonly MediaIngestJobPayload[]
): PreparedImportedData[] {
  const mediaBySanitizedUrl = new Map<string, DiscoveredMedia>();
  for (const media of result.media) {
    const sourceUrl = sanitizeQueueUrl(media.url);
    if (sourceUrl) mediaBySanitizedUrl.set(sourceUrl, media);
  }
  const retrievedAt = parseDate(result.completedAt) ?? new Date();
  return jobs.map((job) => {
    const media = mediaBySanitizedUrl.get(job.sourceUrl);
    return importedDataEntry({
      type: "OTHER",
      key: `media:${job.resourceId}`,
      value: toJsonValue({
        kind: "MEDIA_CANDIDATE",
        resourceId: job.resourceId,
        idempotencyKey: job.idempotencyKey,
        sourceUrl: job.sourceUrl,
        sourcePageUrl: job.sourcePageUrl,
        sourceKind: media?.sourceKind ?? null,
        categoryHint: media?.categoryHint ?? "UNCLASSIFIED",
        alt: media?.alt ?? null,
        title: media?.title ?? null,
        context: media?.context ?? null,
        downloadStatus: "PENDING_HUMAN_REVIEW"
      }),
      normalizedValue: job.sourceUrl,
      sourceUrl: job.sourcePageUrl,
      confidence: 0.9,
      critical: false,
      retrievedAt
    });
  });
}

function prepareMediaJob(
  media: DiscoveredMedia,
  context: Pick<WebsiteImportScanJobPayload, "organizationId" | "actorId"> & {
    websiteImportId: string;
    brandId: string;
  }
): MediaIngestJobPayload | undefined {
  if (!media.allowedForDownload || media.isExternal) return undefined;
  const sourceUrl = sanitizeQueueUrl(media.url);
  const sourcePageUrl = sanitizeQueueUrl(media.pageUrl);
  if (!sourceUrl || !sourcePageUrl) return undefined;
  const digest = createHash("sha256").update(sourceUrl).digest("hex");
  return {
    organizationId: context.organizationId,
    actorId: context.actorId,
    resourceId: `media-${digest}`,
    idempotencyKey: `media-ingest-${context.websiteImportId}-${digest}`,
    websiteImportId: context.websiteImportId,
    brandId: context.brandId,
    sourceUrl,
    sourcePageUrl
  };
}

export function createPersistencePlan(
  importRecord: WebsiteImportRecord,
  payload: WebsiteImportScanJobPayload,
  result: WebsiteCrawlResult
): WebsiteImportPersistencePlan {
  const completedAt = parseDate(result.completedAt) ?? new Date();
  const pages = preparePages(result, completedAt);
  const finalStatus = result.status === "FAILED" ? "FAILED" : "PARTIALLY_COMPLETED";
  const mediaJobs = prepareMediaJobs(result, {
    organizationId: payload.organizationId,
    actorId: payload.actorId,
    websiteImportId: importRecord.id,
    brandId: importRecord.brandId
  });
  const importedData = [
    ...prepareImportedData(result),
    ...prepareMediaImportedData(result, mediaJobs)
  ];

  return {
    importRecord,
    finalStatus,
    startedAt: parseDate(result.startedAt) ?? completedAt,
    completedAt,
    pages,
    importedData,
    establishments: result.establishments
      .filter((establishment) => isAllowedSourceUrl(establishment.source.sourceUrl))
      .map((establishment) => ({
        sourceId: establishment.sourceId,
        name: establishment.name,
        slug: stableSlug("yokosushi-establishment", establishment.sourceId),
        sourceUrl: establishment.source.sourceUrl
      })),
    categories: result.categories
      .filter((category) => isAllowedSourceUrl(category.source.sourceUrl))
      .map((category) => ({
        sourceId: category.sourceId,
        name: category.name,
        slug: stableSlug("yokosushi-category", category.sourceId),
        ...(category.description ? { description: category.description } : {}),
        sourceUrl: category.source.sourceUrl,
        sortOrder: category.order ?? 0
      })),
    products: result.products
      .filter((product) => isAllowedSourceUrl(product.source.sourceUrl))
      .map((product) => {
        const sourceLastModifiedAt = parseDate(product.source.sourceModifiedAt);
        return {
          sourceId: product.sourceId,
          categorySourceId: product.categorySourceId,
          name: product.name,
          slug: stableSlug("yokosushi-product", product.sourceId),
          ...(product.description ? { description: product.description } : {}),
          sourceUrl: product.source.sourceUrl,
          confidence: product.source.confidence,
          ...(sourceLastModifiedAt ? { sourceLastModifiedAt } : {})
        };
      }),
    mediaJobs,
    statistics: {
      pagesDetected: pages.length,
      pagesScanned: result.statistics.pagesScanned,
      productsDetected: result.statistics.productsDetected,
      categoriesDetected: result.statistics.categoriesDetected,
      imagesDetected: result.statistics.imagesDetected,
      warningsCount: result.statistics.warningsCount,
      errorsCount: result.statistics.errorsCount
    },
    ...(finalStatus === "FAILED"
      ? { errorMessage: "Aucun contenu exploitable n’a pu être détecté sur le site autorisé." }
      : {
          errorMessage: [
            ...(result.errors.length > 0
              ? [
                  `${result.errors.length} erreur(s) partielle(s) ont été conservées dans le rapport d’import.`
                ]
              : []),
            MEDIA_DISPATCH_PENDING_MESSAGE
          ].join("\n")
        })
  };
}

function progressStatus(progress: CrawlProgress): "CRAWLING" | "ANALYZING" {
  return progress.stage === "CONNECTING" || progress.stage === "SCANNING_PAGES"
    ? "CRAWLING"
    : "ANALYZING";
}

export class WebsiteImportScanProcessor {
  private readonly now: () => Date;
  private readonly runningLeaseMs: number;

  constructor(
    private readonly repository: WebsiteImportScanRepository,
    private readonly crawler: WebsiteCrawlerProvider,
    private readonly mediaPublisher: MediaIngestJobPublisher,
    private readonly options: WebsiteImportScanProcessorOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.runningLeaseMs = options.runningLeaseMs ?? 30 * 60 * 1000;
  }

  async execute(payload: WebsiteImportScanJobPayload): Promise<WebsiteImportScanOutcome> {
    const importRecord = await this.repository.findByTenant({
      importId: payload.resourceId,
      organizationId: payload.organizationId
    });
    if (!importRecord) throw new WebsiteImportNotFoundError();

    if (
      importRecord.status === "WAITING_FOR_REVIEW" ||
      (importRecord.status === "PARTIALLY_COMPLETED" &&
        importRecord.errorMessage?.includes(MEDIA_DISPATCH_PENDING_MESSAGE))
    ) {
      return this.resumeMediaDispatch(importRecord, payload);
    }

    if (terminalStatuses.has(importRecord.status)) {
      return this.emptyOutcome("ALREADY_PROCESSED", importRecord.id);
    }

    const startedAt = this.now();
    const claimed = await this.repository.claimForScan({
      importId: importRecord.id,
      organizationId: payload.organizationId,
      startedAt,
      staleBefore: new Date(startedAt.getTime() - this.runningLeaseMs)
    });
    if (!claimed) return this.emptyOutcome("ALREADY_RUNNING", importRecord.id);

    try {
      const result = await this.crawler.crawl({
        websiteUrl: importRecord.websiteUrl,
        ...(this.options.crawlerOptions ? { options: this.options.crawlerOptions } : {}),
        onProgress: async (progress) => {
          await this.repository.updateProgress({
            importId: importRecord.id,
            organizationId: payload.organizationId,
            status: progressStatus(progress),
            ...(progress.stage === "SCANNING_PAGES" ? { pagesScanned: progress.completed } : {})
          });
        }
      });
      const plan = createPersistencePlan(importRecord, payload, result);
      await this.repository.persistScan(plan);

      if (plan.finalStatus === "FAILED") {
        return {
          status: "FAILED",
          importId: importRecord.id,
          pagesPersisted: plan.pages.length,
          importedDataPersisted: plan.importedData.length,
          mediaJobsPrepared: plan.mediaJobs.length,
          mediaJobsPublished: 0,
          mediaJobPublishErrors: 0
        };
      }

      const dispatch = await this.publishMediaJobs(importRecord, plan.mediaJobs);
      try {
        await this.repository.markMediaDispatchReady({
          importId: importRecord.id,
          organizationId: payload.organizationId
        });
      } catch {
        throw new WebsiteImportMediaDispatchError(
          dispatch.published,
          1,
          "MEDIA_JOB_RECOVERY_STATE_PERSIST_FAILED"
        );
      }

      return {
        status: "WAITING_FOR_REVIEW",
        importId: importRecord.id,
        pagesPersisted: plan.pages.length,
        importedDataPersisted: plan.importedData.length,
        mediaJobsPrepared: plan.mediaJobs.length,
        mediaJobsPublished: dispatch.published,
        mediaJobPublishErrors: 0
      };
    } catch (error) {
      if (error instanceof WebsiteImportMediaDispatchError) throw error;
      try {
        await this.repository.markFailed({
          importId: importRecord.id,
          organizationId: payload.organizationId,
          completedAt: this.now(),
          errorMessage: "L’analyse du site a été interrompue avant la préparation de l’aperçu."
        });
      } catch {
        // The public worker error below remains intentionally generic even if persistence fails.
      }
      throw new WebsiteImportScanError();
    }
  }

  private async resumeMediaDispatch(
    importRecord: WebsiteImportRecord,
    payload: WebsiteImportScanJobPayload
  ): Promise<WebsiteImportScanOutcome> {
    let mediaJobs: MediaIngestJobPayload[];
    try {
      mediaJobs = await this.repository.findPendingMediaJobs({
        importId: importRecord.id,
        organizationId: payload.organizationId,
        actorId: payload.actorId
      });
    } catch {
      throw new WebsiteImportMediaDispatchError(0, 1, "MEDIA_JOB_RECOVERY_LOAD_FAILED");
    }

    if (mediaJobs.length === 0) {
      if (
        importRecord.status === "PARTIALLY_COMPLETED" &&
        importRecord.errorMessage?.includes(MEDIA_DISPATCH_PENDING_MESSAGE)
      ) {
        try {
          await this.repository.markMediaDispatchReady({
            importId: importRecord.id,
            organizationId: payload.organizationId
          });
        } catch {
          throw new WebsiteImportMediaDispatchError(
            0,
            1,
            "MEDIA_JOB_RECOVERY_STATE_PERSIST_FAILED"
          );
        }
        return {
          ...this.emptyOutcome("ALREADY_PROCESSED", importRecord.id),
          status: "WAITING_FOR_REVIEW"
        };
      }
      return this.emptyOutcome("ALREADY_PROCESSED", importRecord.id);
    }

    const dispatch = await this.publishMediaJobs(importRecord, mediaJobs);
    if (
      importRecord.status === "PARTIALLY_COMPLETED" &&
      importRecord.errorMessage?.includes(MEDIA_DISPATCH_PENDING_MESSAGE)
    ) {
      try {
        await this.repository.markMediaDispatchReady({
          importId: importRecord.id,
          organizationId: payload.organizationId
        });
      } catch {
        throw new WebsiteImportMediaDispatchError(
          dispatch.published,
          1,
          "MEDIA_JOB_RECOVERY_STATE_PERSIST_FAILED"
        );
      }
    }
    return {
      status: "WAITING_FOR_REVIEW",
      importId: importRecord.id,
      pagesPersisted: 0,
      importedDataPersisted: 0,
      mediaJobsPrepared: mediaJobs.length,
      mediaJobsPublished: dispatch.published,
      mediaJobPublishErrors: 0
    };
  }

  private async publishMediaJobs(
    importRecord: WebsiteImportRecord,
    mediaJobs: readonly MediaIngestJobPayload[]
  ): Promise<{ published: number }> {
    let published = 0;
    let failures = 0;
    for (const mediaPayload of mediaJobs) {
      try {
        await this.mediaPublisher.publish(mediaPayload);
        published += 1;
      } catch {
        failures += 1;
      }
    }
    if (failures === 0) return { published };

    try {
      await this.repository.markMediaDispatchPending({
        importId: importRecord.id,
        organizationId: importRecord.organizationId
      });
    } catch {
      throw new WebsiteImportMediaDispatchError(
        published,
        failures,
        "MEDIA_JOB_DISPATCH_STATE_PERSIST_FAILED"
      );
    }
    throw new WebsiteImportMediaDispatchError(published, failures);
  }

  private emptyOutcome(
    status: "ALREADY_PROCESSED" | "ALREADY_RUNNING",
    importId: string
  ): WebsiteImportScanOutcome {
    return {
      status,
      importId,
      pagesPersisted: 0,
      importedDataPersisted: 0,
      mediaJobsPrepared: 0,
      mediaJobsPublished: 0,
      mediaJobPublishErrors: 0
    };
  }
}
