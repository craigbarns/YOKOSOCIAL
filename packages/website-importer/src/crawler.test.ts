import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { YokoSushiHttpCrawlerProvider } from "./crawler.js";
import type { Fetcher } from "./http.js";
import type { DnsResolver } from "./security.js";

const fixture = (name: string): string =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

interface FixtureResponse {
  body: string;
  status?: number;
  contentType: string;
}

function createFixtureNetwork(overrides: ReadonlyMap<string, FixtureResponse> = new Map()) {
  const routes = new Map<string, FixtureResponse>([
    [
      "https://www.yokosushi.fr/robots.txt",
      { body: fixture("robots.txt"), contentType: "text/plain" }
    ],
    [
      "https://www.yokosushi.fr/api/boutique",
      { body: fixture("boutiques.json"), contentType: "application/json" }
    ],
    [
      "https://www.yokosushi.fr/api/famille",
      { body: fixture("families.json"), contentType: "application/json" }
    ],
    [
      "https://www.yokosushi.fr/api/famille/10",
      { body: fixture("family-10.json"), contentType: "application/json" }
    ],
    [
      "https://www.yokosushi.fr/api/famille/11",
      { body: fixture("family-11.json"), contentType: "application/json" }
    ],
    ["https://www.yokosushi.fr/", { body: fixture("page.html"), contentType: "text/html" }],
    [
      "https://www.yokosushi.fr/sitemap",
      { body: fixture("sitemap.html"), contentType: "text/html" }
    ],
    [
      "https://www.yokosushi.fr/restaurants",
      { body: fixture("restaurants.html"), contentType: "text/html" }
    ],
    [
      "https://www.yokosushi.fr/contact",
      { body: fixture("contact.html"), contentType: "text/html" }
    ],
    [
      "https://www.yokosushi.fr/frontend/css/site.css",
      { body: fixture("styles.css"), contentType: "text/css" }
    ]
  ]);
  for (const [url, response] of overrides) routes.set(url, response);

  const calls: string[] = [];
  const unexpected: string[] = [];
  const fetcher: Fetcher = (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push(url);
    const route = routes.get(url);
    if (!route) {
      unexpected.push(url);
      throw new Error(`URL absente des fixtures: ${url}`);
    }
    return Promise.resolve(
      new Response(route.body, {
        status: route.status ?? 200,
        headers: { "content-type": route.contentType }
      })
    );
  };
  return { fetcher, calls, unexpected };
}

const publicDns: DnsResolver = () => Promise.resolve([{ address: "93.184.216.34", family: 4 }]);

function createCrawler(fetcher: Fetcher): YokoSushiHttpCrawlerProvider {
  return new YokoSushiHttpCrawlerProvider({
    fetcher,
    dnsResolver: publicDns,
    sleep: () => Promise.resolve(),
    now: () => new Date("2026-08-02T14:00:00.000Z")
  });
}

const testOptions = {
  maxPages: 10,
  maxFamilies: 10,
  maxStylesheets: 2,
  concurrency: 2,
  delayMs: 0,
  timeoutMs: 2_000,
  retries: 0,
  maxRedirects: 2,
  maxResponseBytes: 2_000_000,
  maxCssBytes: 100_000,
  userAgent: "YokoSushiSocialAgent/Test"
} as const;

describe("YokoSushiHttpCrawlerProvider", () => {
  it("importe les fixtures API-first sans aucun appel réseau réel", async () => {
    const network = createFixtureNetwork();
    const stages: string[] = [];
    const result = await createCrawler(network.fetcher).crawl({
      websiteUrl: "https://www.yokosushi.fr",
      options: testOptions,
      onProgress: (progress) => {
        stages.push(progress.stage);
      }
    });

    expect(network.unexpected).toEqual([]);
    expect(result.status).toBe("COMPLETED");
    expect(result.robots.fetched).toBe(true);
    expect(result.establishments).toHaveLength(2);
    expect(result.establishments[0]?.coordinates).toEqual({
      latitude: 43.6107,
      longitude: 1.4348,
      requiresReview: true
    });
    expect(result.categories.map((category) => category.name)).toEqual(["Sushis", "Makis"]);
    expect(result.products.map((product) => product.name)).toEqual(["Sushi Saumon", "Maki Saumon"]);
    expect(result.products.every((product) => product.allergens.length === 0)).toBe(true);
    expect(result.products[0]).toMatchObject({
      mediaUrl: "https://www.yokosushi.fr/images/sushi-saumon.png",
      establishmentIds: [],
      establishmentAssociation: "BRAND_LEVEL_REQUIRES_REVIEW"
    });
    expect(result.products[1]).toMatchObject({ promotionalPrice: 5.5 });
    expect(result.statistics.hiddenProductsSkipped).toBe(2);
    expect(result.statistics.pagesScanned).toBe(4);
    expect(result.media.map((candidate) => candidate.url)).toEqual(
      expect.arrayContaining([
        "https://www.yokosushi.fr/images/sushi-saumon.png",
        "https://www.yokosushi.fr/frontend/img/ambiance.jpg",
        "https://cdn.example.test/external-promo.png"
      ])
    );
    expect(result.statistics.externalImagesDetected).toBeGreaterThan(0);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("semblent inversées"),
        expect.stringContaining("ne précisent pas leur établissement"),
        expect.stringContaining("ne sont pas des déclarations explicites d’allergènes")
      ])
    );
    expect(stages).toEqual(
      expect.arrayContaining([
        "CONNECTING",
        "DETECTING_ESTABLISHMENTS",
        "DETECTING_PRODUCTS",
        "SCANNING_PAGES",
        "DETECTING_IMAGES",
        "PREPARING_PREVIEW"
      ])
    );

    expect(network.calls[0]).toBe("https://www.yokosushi.fr/robots.txt");
    expect(network.calls.indexOf("https://www.yokosushi.fr/api/famille")).toBeLessThan(
      network.calls.indexOf("https://www.yokosushi.fr/")
    );
    expect(network.calls.some((url) => url.includes("/admin"))).toBe(false);
    expect(network.calls.some((url) => url.includes("/connexion"))).toBe(false);
    expect(network.calls.some((url) => url.includes("facebook.com"))).toBe(false);
    expect(network.calls.some((url) => url.includes("image.ibb.co"))).toBe(false);
  });

  it("conserve les résultats partiels lorsqu’une famille échoue", async () => {
    const network = createFixtureNetwork(
      new Map([
        [
          "https://www.yokosushi.fr/api/famille/11",
          { body: "indisponible", status: 503, contentType: "text/plain" }
        ]
      ])
    );
    const result = await createCrawler(network.fetcher).crawl({
      websiteUrl: "https://www.yokosushi.fr",
      options: testOptions
    });

    expect(network.unexpected).toEqual([]);
    expect(result.status).toBe("PARTIALLY_COMPLETED");
    expect(result.products.map((product) => product.name)).toEqual(["Sushi Saumon"]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://www.yokosushi.fr/api/famille/11",
          code: "HTTP_ERROR",
          statusCode: 503,
          retryable: true
        })
      ])
    );
  });

  it("borne les tentatives HTML, y compris lorsque les liens internes échouent", async () => {
    const brokenLinks = Array.from(
      { length: 100 },
      (_, index) => `<a href="/broken-${index}">cassé</a>`
    ).join("");
    const network = createFixtureNetwork(
      new Map([
        [
          "https://www.yokosushi.fr/",
          {
            body: `<!doctype html><html><body>${brokenLinks}</body></html>`,
            contentType: "text/html"
          }
        ]
      ])
    );

    const result = await createCrawler(network.fetcher).crawl({
      websiteUrl: "https://www.yokosushi.fr",
      options: { ...testOptions, maxPages: 5 }
    });

    const htmlCalls = network.calls.filter(
      (url) =>
        url === "https://www.yokosushi.fr/" ||
        url === "https://www.yokosushi.fr/sitemap" ||
        url.includes("/broken-")
    );
    expect(htmlCalls).toHaveLength(5);
    expect(network.unexpected).toHaveLength(3);
    expect(result.errors).toHaveLength(3);
    expect(result.warnings).toContain(
      "Certaines pages ont été ignorées à cause de la limite maximale de pages."
    );
  });
});
