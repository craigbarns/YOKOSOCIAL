import type {
  CrawlProgress,
  DiscoveredMedia,
  ImportedProduct,
  SourceReference,
  WebsiteCrawlerProvider,
  WebsiteCrawlInput,
  WebsiteCrawlResult
} from "./types.js";

const DEMO_SOURCE_URL = "https://demo.invalid/yokosushi-import";

function demoSource(retrievedAt: string, jsonPointer: string): SourceReference {
  return {
    sourceUrl: DEMO_SOURCE_URL,
    retrievedAt,
    confidence: 1,
    validationStatus: "PENDING",
    jsonPointer
  };
}

function demoMedia(path: string, context: string): DiscoveredMedia {
  return {
    url: `/demo-media/${path}`,
    pageUrl: DEMO_SOURCE_URL,
    sourceKind: "MOCK",
    allowedForDownload: false,
    isExternal: false,
    categoryHint: path.includes("restaurant") ? "RESTAURANT" : "PRODUCT",
    context: `DÉMONSTRATION — ${context}`
  };
}

function demoProduct(
  id: string,
  categoryId: string,
  name: string,
  price: number,
  mediaUrl: string,
  retrievedAt: string,
  index: number
): ImportedProduct {
  return {
    sourceId: id,
    categorySourceId: categoryId,
    name: `DÉMONSTRATION — ${name}`,
    description: "Produit fictif chargé uniquement pour le parcours de démonstration.",
    price,
    allergens: [],
    mediaUrl,
    badges: ["DÉMO"],
    establishmentIds: [],
    establishmentAssociation: "BRAND_LEVEL_REQUIRES_REVIEW",
    source: demoSource(retrievedAt, `/products/${index}`)
  };
}

export class MockWebsiteCrawlerProvider implements WebsiteCrawlerProvider {
  readonly name = "mock";

  constructor(private readonly now: () => Date = () => new Date()) {}

  async crawl(input: WebsiteCrawlInput): Promise<WebsiteCrawlResult> {
    const startedAt = this.now().toISOString();
    const progress: CrawlProgress[] = [
      { stage: "CONNECTING", message: "Simulation de la connexion", completed: 1, total: 1 },
      {
        stage: "DETECTING_ESTABLISHMENTS",
        message: "Simulation des restaurants",
        completed: 2,
        total: 2
      },
      {
        stage: "DETECTING_PRODUCTS",
        message: "Simulation des produits",
        completed: 4,
        total: 4
      },
      {
        stage: "DETECTING_IMAGES",
        message: "Simulation des images",
        completed: 5,
        total: 5
      },
      {
        stage: "PREPARING_PREVIEW",
        message: "Préparation de l’aperçu de démonstration",
        completed: 1,
        total: 1
      }
    ];
    for (const event of progress) {
      if (input.signal?.aborted) throw new Error("L’import de démonstration a été annulé.");
      await input.onProgress?.(event);
    }

    const media = [
      demoMedia("demo-plateau.svg", "Plateau fictif"),
      demoMedia("demo-sushi.svg", "Sushi fictif"),
      demoMedia("demo-poke.svg", "Poké fictif"),
      demoMedia("demo-restaurant-compans.svg", "Restaurant Compans fictif"),
      demoMedia("demo-restaurant-peri.svg", "Restaurant Péri fictif")
    ];
    const products = [
      demoProduct(
        "demo-product-1",
        "demo-category-1",
        "Plateau Yoko Démo",
        24.9,
        media[0]!.url,
        startedAt,
        0
      ),
      demoProduct(
        "demo-product-2",
        "demo-category-1",
        "Sushi saumon Démo",
        2.5,
        media[1]!.url,
        startedAt,
        1
      ),
      demoProduct(
        "demo-product-3",
        "demo-category-2",
        "Poké végétal Démo",
        12.9,
        media[2]!.url,
        startedAt,
        2
      ),
      demoProduct(
        "demo-product-4",
        "demo-category-2",
        "Dessert mochi Démo",
        5.5,
        media[0]!.url,
        startedAt,
        3
      )
    ];
    const warnings = [
      "Toutes les données de ce résultat sont fictives et ne proviennent pas de yokosushi.fr.",
      "Les produits de démonstration doivent être remplacés par un import validé avant publication."
    ];

    return {
      provider: "mock",
      isDemo: true,
      status: "COMPLETED",
      websiteUrl: input.websiteUrl,
      startedAt,
      completedAt: this.now().toISOString(),
      robots: {
        url: "https://demo.invalid/robots.txt",
        fetched: false,
        disallowedPaths: []
      },
      pages: [
        {
          url: DEMO_SOURCE_URL,
          statusCode: 200,
          title: "DÉMONSTRATION — YokoSushi",
          openGraph: {},
          jsonLd: [],
          links: [],
          media,
          stylesheetUrls: []
        }
      ],
      establishments: [
        {
          sourceId: "demo-establishment-compans",
          name: "DÉMONSTRATION — YokoSushi Compans",
          phone: "00 00 00 00 01",
          address: { formatted: "Adresse fictive — ne pas publier" },
          source: demoSource(startedAt, "/establishments/0")
        },
        {
          sourceId: "demo-establishment-peri",
          name: "DÉMONSTRATION — YokoSushi Péri",
          phone: "00 00 00 00 02",
          address: { formatted: "Adresse fictive — ne pas publier" },
          source: demoSource(startedAt, "/establishments/1")
        }
      ],
      categories: [
        {
          sourceId: "demo-category-1",
          name: "DÉMONSTRATION — Sushis et plateaux",
          source: demoSource(startedAt, "/categories/0")
        },
        {
          sourceId: "demo-category-2",
          name: "DÉMONSTRATION — Pokés et desserts",
          source: demoSource(startedAt, "/categories/1")
        }
      ],
      products,
      media,
      externalLinks: [],
      warnings,
      errors: [],
      statistics: {
        pagesScanned: 1,
        establishmentsDetected: 2,
        categoriesDetected: 2,
        productsDetected: products.length,
        hiddenProductsSkipped: 0,
        imagesDetected: media.length,
        externalImagesDetected: 0,
        warningsCount: warnings.length,
        errorsCount: 0
      }
    };
  }
}
