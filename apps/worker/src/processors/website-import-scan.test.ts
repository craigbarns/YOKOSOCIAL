import { describe, expect, it, vi } from "vitest";

import { mediaIngestJobPayloadSchema, type WebsiteImportScanJobPayload } from "@yokosocial/shared";
import type { WebsiteCrawlerProvider, WebsiteCrawlResult } from "@yokosocial/website-importer";

import {
  createPersistencePlan,
  MEDIA_DISPATCH_PENDING_MESSAGE,
  mediaIngestBullJobId,
  WebsiteImportMediaDispatchError,
  WebsiteImportNotFoundError,
  WebsiteImportScanError,
  WebsiteImportScanProcessor,
  type MediaIngestJobPublisher,
  type WebsiteImportRecord,
  type WebsiteImportScanRepository
} from "./website-import-scan.js";

const retrievedAt = "2026-08-02T10:00:00.000Z";
const completedAt = "2026-08-02T10:05:00.000Z";

const payload: WebsiteImportScanJobPayload = {
  organizationId: "org-yoko",
  actorId: "user-owner",
  resourceId: "import-1",
  idempotencyKey: "website-import-scan-import-1"
};

function importRecord(status: WebsiteImportRecord["status"] = "PENDING"): WebsiteImportRecord {
  return {
    id: "import-1",
    organizationId: "org-yoko",
    brandId: "brand-yoko",
    websiteUrl: "https://www.yokosushi.fr",
    status,
    updatedAt: new Date("2026-08-02T09:00:00.000Z"),
    errorMessage: null
  };
}

function crawlResult(overrides: Partial<WebsiteCrawlResult> = {}): WebsiteCrawlResult {
  const internalMedia = {
    url: "https://www.yokosushi.fr/images/saumon.jpg?v=2#photo",
    pageUrl: "https://www.yokosushi.fr/carte?tracking=1",
    sourceKind: "IMG_SRC" as const,
    allowedForDownload: true,
    isExternal: false,
    categoryHint: "PRODUCT" as const,
    alt: "Sushi saumon"
  };
  return {
    provider: "yokosushi-http",
    isDemo: false,
    status: "PARTIALLY_COMPLETED",
    websiteUrl: "https://www.yokosushi.fr/",
    startedAt: retrievedAt,
    completedAt,
    robots: {
      url: "https://www.yokosushi.fr/robots.txt",
      fetched: true,
      disallowedPaths: []
    },
    pages: [
      {
        url: "https://www.yokosushi.fr/",
        statusCode: 200,
        title: "YokoSushi",
        openGraph: {},
        jsonLd: [],
        links: [],
        media: [internalMedia],
        stylesheetUrls: []
      }
    ],
    establishments: [
      {
        sourceId: "10",
        name: "YokoSushi Compans",
        phone: "05 61 00 00 00",
        address: {
          street: "1 rue Exemple",
          postalCode: "31000",
          city: "Toulouse",
          country: "France",
          formatted: "1 rue Exemple, 31000 Toulouse"
        },
        coordinates: { latitude: 43.61, longitude: 1.44, requiresReview: false },
        source: {
          sourceUrl: "https://www.yokosushi.fr/api/boutique",
          retrievedAt,
          confidence: 0.95,
          validationStatus: "PENDING"
        }
      }
    ],
    categories: [
      {
        sourceId: "20",
        name: "Sushi",
        order: 1,
        source: {
          sourceUrl: "https://www.yokosushi.fr/api/famille",
          retrievedAt,
          confidence: 0.95,
          validationStatus: "PENDING"
        }
      }
    ],
    products: [
      {
        sourceId: "30",
        categorySourceId: "20",
        name: "Sushi saumon",
        description: "Saumon et riz vinaigré",
        price: 7.9,
        promotionalPrice: 6.9,
        allergens: ["Poisson"],
        badges: [],
        establishmentIds: [],
        establishmentAssociation: "BRAND_LEVEL_REQUIRES_REVIEW",
        source: {
          sourceUrl: "https://www.yokosushi.fr/api/famille/20",
          retrievedAt,
          confidence: 0.95,
          validationStatus: "PENDING"
        }
      }
    ],
    media: [
      internalMedia,
      {
        url: "https://cdn.example.com/external.jpg",
        pageUrl: "https://www.yokosushi.fr/",
        sourceKind: "OG_IMAGE",
        allowedForDownload: false,
        isExternal: true,
        categoryHint: "UNCLASSIFIED"
      }
    ],
    externalLinks: [],
    warnings: ["Une information nécessite une validation."],
    errors: [
      {
        url: "https://www.yokosushi.fr/styles/missing.css",
        stage: "CSS",
        code: "HTTP_404",
        message: "La feuille de style est introuvable.",
        retryable: false,
        statusCode: 404
      }
    ],
    statistics: {
      pagesScanned: 1,
      establishmentsDetected: 1,
      categoriesDetected: 1,
      productsDetected: 1,
      hiddenProductsSkipped: 0,
      imagesDetected: 2,
      externalImagesDetected: 1,
      warningsCount: 1,
      errorsCount: 1
    },
    ...overrides
  };
}

function createRepository(record: WebsiteImportRecord | null = importRecord()) {
  const findByTenant = vi
    .fn<WebsiteImportScanRepository["findByTenant"]>()
    .mockResolvedValue(record);
  const claimForScan = vi.fn<WebsiteImportScanRepository["claimForScan"]>().mockResolvedValue(true);
  const updateProgress = vi
    .fn<WebsiteImportScanRepository["updateProgress"]>()
    .mockResolvedValue(undefined);
  const persistScan = vi
    .fn<WebsiteImportScanRepository["persistScan"]>()
    .mockResolvedValue(undefined);
  const findPendingMediaJobs = vi
    .fn<WebsiteImportScanRepository["findPendingMediaJobs"]>()
    .mockResolvedValue([]);
  const markMediaDispatchPending = vi
    .fn<WebsiteImportScanRepository["markMediaDispatchPending"]>()
    .mockResolvedValue(undefined);
  const markMediaDispatchReady = vi
    .fn<WebsiteImportScanRepository["markMediaDispatchReady"]>()
    .mockResolvedValue(undefined);
  const markFailed = vi
    .fn<WebsiteImportScanRepository["markFailed"]>()
    .mockResolvedValue(undefined);
  return {
    repository: {
      findByTenant,
      claimForScan,
      updateProgress,
      persistScan,
      findPendingMediaJobs,
      markMediaDispatchPending,
      markMediaDispatchReady,
      markFailed
    } satisfies WebsiteImportScanRepository,
    findByTenant,
    claimForScan,
    updateProgress,
    persistScan,
    findPendingMediaJobs,
    markMediaDispatchPending,
    markMediaDispatchReady,
    markFailed
  };
}

function createCrawler(result: WebsiteCrawlResult = crawlResult()) {
  const crawl = vi.fn<WebsiteCrawlerProvider["crawl"]>(async (input) => {
    await input.onProgress?.({ stage: "CONNECTING", message: "Connexion", completed: 0 });
    await input.onProgress?.({
      stage: "SCANNING_PAGES",
      message: "Pages",
      completed: 1,
      total: 10
    });
    await input.onProgress?.({
      stage: "DETECTING_PRODUCTS",
      message: "Produits",
      completed: 0
    });
    return result;
  });
  return {
    crawler: { name: "test-crawler", crawl } satisfies WebsiteCrawlerProvider,
    crawl
  };
}

function createPublisher() {
  const publish = vi.fn<MediaIngestJobPublisher["publish"]>().mockResolvedValue(undefined);
  return {
    publisher: { publish } satisfies MediaIngestJobPublisher,
    publish
  };
}

describe("WebsiteImportScanProcessor", () => {
  it("persiste un aperçu réel sans appliquer les données critiques", async () => {
    const repositoryDouble = createRepository();
    const crawlerDouble = createCrawler();
    const publisherDouble = createPublisher();
    const processor = new WebsiteImportScanProcessor(
      repositoryDouble.repository,
      crawlerDouble.crawler,
      publisherDouble.publisher,
      { now: () => new Date("2026-08-02T10:00:00.000Z") }
    );

    const outcome = await processor.execute(payload);

    expect(outcome).toMatchObject({
      status: "WAITING_FOR_REVIEW",
      mediaJobsPrepared: 1,
      mediaJobsPublished: 1,
      mediaJobPublishErrors: 0
    });
    expect(repositoryDouble.claimForScan).toHaveBeenCalledOnce();
    expect(repositoryDouble.updateProgress).toHaveBeenCalledWith({
      importId: "import-1",
      organizationId: "org-yoko",
      status: "CRAWLING",
      pagesScanned: 1
    });
    expect(repositoryDouble.persistScan).toHaveBeenCalledOnce();
    expect(repositoryDouble.markMediaDispatchReady).toHaveBeenCalledWith({
      importId: "import-1",
      organizationId: "org-yoko"
    });

    const plan = repositoryDouble.persistScan.mock.calls[0]?.[0];
    expect(plan).toBeDefined();
    expect(plan?.finalStatus).toBe("PARTIALLY_COMPLETED");
    expect(plan?.errorMessage).toContain(MEDIA_DISPATCH_PENDING_MESSAGE);
    expect(plan?.establishments[0]).not.toHaveProperty("phone");
    expect(plan?.establishments[0]).not.toHaveProperty("address");
    expect(plan?.products[0]).not.toHaveProperty("price");
    expect(plan?.products[0]).not.toHaveProperty("allergens");
    expect(
      plan?.importedData
        .filter((entry) => ["ADDRESS", "PHONE", "PRICE", "ALLERGEN"].includes(entry.type))
        .every((entry) => entry.critical)
    ).toBe(true);
    expect(
      plan?.importedData.some((entry) => entry.type === "OTHER" && entry.key.startsWith("media:"))
    ).toBe(true);

    const mediaPayload = publisherDouble.publish.mock.calls[0]?.[0];
    expect(mediaIngestJobPayloadSchema.parse(mediaPayload)).toMatchObject({
      organizationId: "org-yoko",
      websiteImportId: "import-1",
      brandId: "brand-yoko",
      sourceUrl: "https://www.yokosushi.fr/images/saumon.jpg",
      sourcePageUrl: "https://www.yokosushi.fr/carte"
    });
  });

  it("refuse tout import absent du périmètre de l’organisation", async () => {
    const repositoryDouble = createRepository(null);
    const crawlerDouble = createCrawler();
    const publisherDouble = createPublisher();
    const processor = new WebsiteImportScanProcessor(
      repositoryDouble.repository,
      crawlerDouble.crawler,
      publisherDouble.publisher
    );

    await expect(processor.execute(payload)).rejects.toBeInstanceOf(WebsiteImportNotFoundError);
    expect(repositoryDouble.claimForScan).not.toHaveBeenCalled();
    expect(crawlerDouble.crawl).not.toHaveBeenCalled();
  });

  it("ignore de façon idempotente un import déjà prêt pour validation", async () => {
    const repositoryDouble = createRepository(importRecord("WAITING_FOR_REVIEW"));
    const crawlerDouble = createCrawler();
    const publisherDouble = createPublisher();
    const processor = new WebsiteImportScanProcessor(
      repositoryDouble.repository,
      crawlerDouble.crawler,
      publisherDouble.publisher
    );

    await expect(processor.execute(payload)).resolves.toMatchObject({
      status: "ALREADY_PROCESSED",
      mediaJobsPrepared: 0
    });
    expect(repositoryDouble.claimForScan).not.toHaveBeenCalled();
    expect(crawlerDouble.crawl).not.toHaveBeenCalled();
  });

  it("ne lance pas un second crawl lorsqu’un autre worker détient le claim", async () => {
    const repositoryDouble = createRepository();
    repositoryDouble.claimForScan.mockResolvedValue(false);
    const crawlerDouble = createCrawler();
    const publisherDouble = createPublisher();
    const processor = new WebsiteImportScanProcessor(
      repositoryDouble.repository,
      crawlerDouble.crawler,
      publisherDouble.publisher
    );

    await expect(processor.execute(payload)).resolves.toMatchObject({ status: "ALREADY_RUNNING" });
    expect(crawlerDouble.crawl).not.toHaveBeenCalled();
    expect(repositoryDouble.persistScan).not.toHaveBeenCalled();
  });

  it("conserve les erreurs partielles tout en ouvrant la validation humaine", async () => {
    const repositoryDouble = createRepository();
    const crawlerDouble = createCrawler();
    const publisherDouble = createPublisher();
    const processor = new WebsiteImportScanProcessor(
      repositoryDouble.repository,
      crawlerDouble.crawler,
      publisherDouble.publisher
    );

    const outcome = await processor.execute(payload);
    const plan = repositoryDouble.persistScan.mock.calls[0]?.[0];

    expect(outcome.status).toBe("WAITING_FOR_REVIEW");
    expect(plan?.statistics.errorsCount).toBe(1);
    expect(plan?.pages.some((page) => page.status === "FAILED")).toBe(true);
    expect(plan?.errorMessage).toContain("erreur(s) partielle(s)");
    expect(repositoryDouble.markFailed).not.toHaveBeenCalled();
  });

  it("propage une panne Redis partielle et marque l'import comme réparable", async () => {
    const secondMedia = {
      url: "https://yokosushi.fr/images/maki.jpg",
      pageUrl: "https://www.yokosushi.fr/carte",
      sourceKind: "IMG_SRC" as const,
      allowedForDownload: true,
      isExternal: false,
      categoryHint: "PRODUCT" as const
    };
    const result = crawlResult();
    result.media.push(secondMedia);
    result.statistics.imagesDetected += 1;
    const repositoryDouble = createRepository();
    const crawlerDouble = createCrawler(result);
    const publish = vi
      .fn<MediaIngestJobPublisher["publish"]>()
      .mockRejectedValueOnce(new Error("Redis indisponible"))
      .mockResolvedValueOnce(undefined);
    const processor = new WebsiteImportScanProcessor(
      repositoryDouble.repository,
      crawlerDouble.crawler,
      { publish }
    );

    await expect(processor.execute(payload)).rejects.toMatchObject({
      name: "WebsiteImportMediaDispatchError",
      mediaJobsPublished: 1,
      mediaJobPublishErrors: 1
    });
    expect(repositoryDouble.markMediaDispatchPending).toHaveBeenCalledWith({
      importId: "import-1",
      organizationId: "org-yoko"
    });
    expect(repositoryDouble.markMediaDispatchReady).not.toHaveBeenCalled();
    expect(repositoryDouble.markFailed).not.toHaveBeenCalled();
  });

  it("répare un crash après persistance en ré-enqueueant les candidats avec les mêmes IDs", async () => {
    const readyRecord = importRecord("WAITING_FOR_REVIEW");
    const repositoryDouble = createRepository(readyRecord);
    const pendingJobs = createPersistencePlan(readyRecord, payload, crawlResult()).mediaJobs;
    repositoryDouble.findPendingMediaJobs.mockResolvedValue(pendingJobs);
    const crawlerDouble = createCrawler();
    const publisherDouble = createPublisher();
    const processor = new WebsiteImportScanProcessor(
      repositoryDouble.repository,
      crawlerDouble.crawler,
      publisherDouble.publisher
    );

    await expect(processor.execute(payload)).resolves.toMatchObject({
      status: "WAITING_FOR_REVIEW",
      mediaJobsPrepared: 1,
      mediaJobsPublished: 1,
      mediaJobPublishErrors: 0
    });
    expect(repositoryDouble.findPendingMediaJobs).toHaveBeenCalledWith({
      importId: "import-1",
      organizationId: "org-yoko",
      actorId: "user-owner"
    });
    expect(repositoryDouble.claimForScan).not.toHaveBeenCalled();
    expect(crawlerDouble.crawl).not.toHaveBeenCalled();
    expect(publisherDouble.publish.mock.calls[0]?.[0]?.idempotencyKey).toBe(
      pendingJobs[0]?.idempotencyKey
    );
  });

  it("finalise la reprise PARTIALLY_COMPLETED une fois tous les jobs idempotents acceptés", async () => {
    const partialRecord: WebsiteImportRecord = {
      ...importRecord("PARTIALLY_COMPLETED"),
      errorMessage: MEDIA_DISPATCH_PENDING_MESSAGE
    };
    const repositoryDouble = createRepository(partialRecord);
    const pendingJobs = createPersistencePlan(partialRecord, payload, crawlResult()).mediaJobs;
    repositoryDouble.findPendingMediaJobs.mockResolvedValue(pendingJobs);
    const crawlerDouble = createCrawler();
    const publisherDouble = createPublisher();
    const processor = new WebsiteImportScanProcessor(
      repositoryDouble.repository,
      crawlerDouble.crawler,
      publisherDouble.publisher
    );

    await expect(processor.execute(payload)).resolves.toMatchObject({
      status: "WAITING_FOR_REVIEW",
      mediaJobsPublished: 1
    });
    expect(repositoryDouble.markMediaDispatchReady).toHaveBeenCalledWith({
      importId: "import-1",
      organizationId: "org-yoko"
    });
    expect(crawlerDouble.crawl).not.toHaveBeenCalled();
  });

  it("ne masque pas une nouvelle panne Redis pendant la reprise après crash", async () => {
    const readyRecord = importRecord("WAITING_FOR_REVIEW");
    const repositoryDouble = createRepository(readyRecord);
    repositoryDouble.findPendingMediaJobs.mockResolvedValue(
      createPersistencePlan(readyRecord, payload, crawlResult()).mediaJobs
    );
    const publisherDouble = createPublisher();
    publisherDouble.publish.mockRejectedValue(new Error("Redis indisponible"));
    const processor = new WebsiteImportScanProcessor(
      repositoryDouble.repository,
      createCrawler().crawler,
      publisherDouble.publisher
    );

    await expect(processor.execute(payload)).rejects.toBeInstanceOf(
      WebsiteImportMediaDispatchError
    );
    expect(repositoryDouble.markMediaDispatchPending).toHaveBeenCalledOnce();
  });

  it("marque l’import en échec avec un message sûr si le crawler lève une exception", async () => {
    const repositoryDouble = createRepository();
    repositoryDouble.markFailed.mockRejectedValue(
      new Error("DATABASE_URL=postgres://mot-de-passe-interdit")
    );
    const crawl = vi
      .fn<WebsiteCrawlerProvider["crawl"]>()
      .mockRejectedValue(new Error("OPENAI_API_KEY=ne-doit-pas-apparaitre"));
    const publisherDouble = createPublisher();
    const processor = new WebsiteImportScanProcessor(
      repositoryDouble.repository,
      { name: "failing-crawler", crawl },
      publisherDouble.publisher,
      { now: () => new Date("2026-08-02T10:06:00.000Z") }
    );

    await expect(processor.execute(payload)).rejects.toBeInstanceOf(WebsiteImportScanError);
    expect(repositoryDouble.markFailed).toHaveBeenCalledWith({
      importId: "import-1",
      organizationId: "org-yoko",
      completedAt: new Date("2026-08-02T10:06:00.000Z"),
      errorMessage: "L’analyse du site a été interrompue avant la préparation de l’aperçu."
    });
    expect(JSON.stringify(repositoryDouble.markFailed.mock.calls)).not.toContain(
      "ne-doit-pas-apparaitre"
    );
  });
});

describe("createPersistencePlan", () => {
  it("produit les mêmes identifiants, empreintes et jobs lors d’une relance", () => {
    const first = createPersistencePlan(importRecord(), payload, crawlResult());
    const second = createPersistencePlan(importRecord(), payload, crawlResult());

    expect(second.establishments).toEqual(first.establishments);
    expect(second.products).toEqual(first.products);
    expect(second.importedData.map((entry) => entry.fingerprint)).toEqual(
      first.importedData.map((entry) => entry.fingerprint)
    );
    expect(second.mediaJobs).toEqual(first.mediaJobs);
    expect(first.finalStatus).toBe("PARTIALLY_COMPLETED");
    expect(first.mediaJobs[0] && mediaIngestBullJobId(first.mediaJobs[0])).toBe(
      first.mediaJobs[0]?.idempotencyKey
    );
  });

  it("écarte les sources hors allowlist même si un provider les marque téléchargeables", () => {
    const result = crawlResult();
    const establishment = result.establishments[0];
    const category = result.categories[0];
    const product = result.products[0];
    if (!establishment || !category || !product) throw new Error("Fixture incomplète");
    establishment.source.sourceUrl = "https://attacker.example/api/boutique";
    category.source.sourceUrl = "https://attacker.example/api/famille";
    product.source.sourceUrl = "https://attacker.example/api/famille/20";
    result.media = [
      {
        url: "https://attacker.example/photo.jpg",
        pageUrl: "https://www.yokosushi.fr/",
        sourceKind: "IMG_SRC",
        allowedForDownload: true,
        isExternal: false,
        categoryHint: "PRODUCT"
      }
    ];

    const plan = createPersistencePlan(importRecord(), payload, result);

    expect(plan.establishments).toHaveLength(0);
    expect(plan.categories).toHaveLength(0);
    expect(plan.products).toHaveLength(0);
    expect(plan.importedData).toHaveLength(0);
    expect(plan.mediaJobs).toHaveLength(0);
    expect(plan.pages.every((page) => !page.sourceUrl.includes("attacker.example"))).toBe(true);
  });
});
