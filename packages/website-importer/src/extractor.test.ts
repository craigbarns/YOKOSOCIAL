import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { extractCssMedia, extractHtmlContent } from "./extractor.js";
import { YOKOSUSHI_ALLOWED_HOSTS } from "./types.js";

const fixture = (name: string): string =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

describe("extractHtmlContent", () => {
  it("extrait HTML, Open Graph, JSON-LD, srcset, lazy loading et CSS", () => {
    const pageUrl = "https://www.yokosushi.fr/";
    const result = extractHtmlContent(fixture("page.html"), pageUrl, YOKOSUSHI_ALLOWED_HOSTS);

    expect(result.title).toBe("YokoSushi — fixture");
    expect(result.description).toBe("Contenu de test hors ligne");
    expect(result.openGraph["og:title"]).toEqual(["YokoSushi fixture"]);
    expect(result.jsonLd).toHaveLength(1);
    expect(result.warnings).toContain("Une balise JSON-LD invalide a été ignorée.");
    expect(result.stylesheetUrls).toEqual(["https://www.yokosushi.fr/frontend/css/site.css"]);

    const urls = result.media.map((media) => media.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        "http://dev.yokosushi.fr/frontend/img/og.jpg",
        "https://www.yokosushi.fr/frontend/img/logo.png",
        "https://www.yokosushi.fr/frontend/img/brand-photo.jpg",
        "https://www.yokosushi.fr/frontend/img/hero.jpg",
        "https://www.yokosushi.fr/images/plateau-large.jpg",
        "https://www.yokosushi.fr/images/lazy-sushi.webp",
        "https://www.yokosushi.fr/images/restaurant-peri@2x.webp",
        "https://www.yokosushi.fr/frontend/img/slider-resto/Compans-1.jpg"
      ])
    );
    expect(
      result.media.find((media) => media.url.startsWith("http://dev.yokosushi.fr"))
    ).toMatchObject({ allowedForDownload: false, isExternal: true });
    expect(result.media.find((media) => media.url.endsWith("/mobile/hamburger.png"))).toMatchObject(
      { categoryHint: "TECHNICAL" }
    );
    expect(result.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://www.yokosushi.fr/restaurants",
          isExternal: false
        }),
        expect.objectContaining({
          url: "https://www.facebook.com/YokoSushiToulouse/",
          isExternal: true
        })
      ])
    );
  });
});

describe("extractCssMedia", () => {
  it("résout les images relatives et ignore les polices", () => {
    const result = extractCssMedia(
      fixture("styles.css"),
      "https://www.yokosushi.fr/frontend/css/site.css",
      "https://www.yokosushi.fr/frontend/css/site.css",
      YOKOSUSHI_ALLOWED_HOSTS
    );

    expect(result.map((media) => media.url)).toEqual([
      "https://www.yokosushi.fr/frontend/img/ambiance.jpg",
      "https://cdn.example.test/external-promo.png"
    ]);
    expect(result[1]).toMatchObject({ allowedForDownload: false, isExternal: true });
  });
});
