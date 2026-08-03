export const YOKOSUSHI_ALLOWED_HOSTS = ["yokosushi.fr", "www.yokosushi.fr"] as const;

export type CrawlStatus = "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";

export type CrawlStage =
  | "CONNECTING"
  | "SCANNING_PAGES"
  | "DETECTING_ESTABLISHMENTS"
  | "DETECTING_PRODUCTS"
  | "DETECTING_IMAGES"
  | "PREPARING_PREVIEW";

export interface CrawlProgress {
  stage: CrawlStage;
  message: string;
  completed: number;
  total?: number;
}

export interface CrawlerOptions {
  maxPages: number;
  maxFamilies: number;
  maxStylesheets: number;
  concurrency: number;
  delayMs: number;
  timeoutMs: number;
  retries: number;
  maxRedirects: number;
  maxResponseBytes: number;
  maxCssBytes: number;
  userAgent: string;
}

export interface WebsiteCrawlInput {
  websiteUrl: string;
  options?: Partial<CrawlerOptions>;
  signal?: AbortSignal;
  onProgress?: (progress: CrawlProgress) => void | Promise<void>;
}

export interface SourceReference {
  sourceUrl: string;
  retrievedAt: string;
  confidence: number;
  validationStatus: "PENDING" | "VALIDATED" | "REJECTED";
  selector?: string;
  jsonPointer?: string;
  sourceModifiedAt?: string;
}

export type MediaSourceKind =
  | "IMG_SRC"
  | "IMG_SRCSET"
  | "DATA_SRC"
  | "PICTURE_SOURCE"
  | "OG_IMAGE"
  | "JSON_LD"
  | "CSS_BACKGROUND"
  | "API_PRODUCT"
  | "API_CATEGORY"
  | "MOCK";

export type MediaCategoryHint = "LOGO" | "PRODUCT" | "RESTAURANT" | "TECHNICAL" | "UNCLASSIFIED";

export interface DiscoveredMedia {
  url: string;
  pageUrl: string;
  sourceKind: MediaSourceKind;
  allowedForDownload: boolean;
  isExternal: boolean;
  categoryHint: MediaCategoryHint;
  alt?: string;
  title?: string;
  context?: string;
}

export interface DiscoveredLink {
  url: string;
  pageUrl: string;
  text: string;
  isExternal: boolean;
}

export interface OpenGraphMetadata {
  [property: string]: string[];
}

export interface CrawledPage {
  url: string;
  statusCode: number;
  title?: string;
  description?: string;
  sourceModifiedAt?: string;
  openGraph: OpenGraphMetadata;
  jsonLd: unknown[];
  links: DiscoveredLink[];
  media: DiscoveredMedia[];
  stylesheetUrls: string[];
}

export interface ImportedEstablishment {
  sourceId: string;
  name: string;
  phone?: string;
  address?: {
    street?: string;
    postalCode?: string;
    city?: string;
    country?: string;
    formatted?: string;
  };
  coordinates?: {
    latitude: number;
    longitude: number;
    requiresReview: boolean;
  };
  deliveryArea?: Array<[number, number]>;
  source: SourceReference;
}

export interface ImportedCategory {
  sourceId: string;
  name: string;
  title?: string;
  description?: string;
  order?: number;
  source: SourceReference;
}

export interface ImportedProduct {
  sourceId: string;
  categorySourceId: string;
  name: string;
  description?: string;
  unit?: string;
  price: number;
  promotionalPrice?: number;
  allergens: string[];
  mediaUrl?: string;
  badges: string[];
  establishmentIds: string[];
  establishmentAssociation: "BRAND_LEVEL_REQUIRES_REVIEW";
  source: SourceReference;
}

export interface CrawlError {
  url: string;
  stage: CrawlStage | "ROBOTS" | "API" | "CSS";
  code: string;
  message: string;
  retryable: boolean;
  statusCode?: number;
}

export interface RobotsSummary {
  url: string;
  fetched: boolean;
  disallowedPaths: string[];
}

export interface CrawlStatistics {
  pagesScanned: number;
  establishmentsDetected: number;
  categoriesDetected: number;
  productsDetected: number;
  hiddenProductsSkipped: number;
  imagesDetected: number;
  externalImagesDetected: number;
  warningsCount: number;
  errorsCount: number;
}

export interface WebsiteCrawlResult {
  provider: "mock" | "yokosushi-http";
  isDemo: boolean;
  status: CrawlStatus;
  websiteUrl: string;
  startedAt: string;
  completedAt: string;
  robots: RobotsSummary;
  pages: CrawledPage[];
  establishments: ImportedEstablishment[];
  categories: ImportedCategory[];
  products: ImportedProduct[];
  media: DiscoveredMedia[];
  externalLinks: DiscoveredLink[];
  warnings: string[];
  errors: CrawlError[];
  statistics: CrawlStatistics;
}

export interface WebsiteCrawlerProvider {
  readonly name: string;
  crawl(input: WebsiteCrawlInput): Promise<WebsiteCrawlResult>;
}
