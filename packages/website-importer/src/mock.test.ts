import { describe, expect, it } from "vitest";

import { MockWebsiteCrawlerProvider } from "./mock.js";

describe("MockWebsiteCrawlerProvider", () => {
  it("marque explicitement toutes les données comme démonstration", async () => {
    const result = await new MockWebsiteCrawlerProvider(
      () => new Date("2026-08-02T14:00:00.000Z")
    ).crawl({ websiteUrl: "https://www.yokosushi.fr" });

    expect(result.isDemo).toBe(true);
    expect(result.provider).toBe("mock");
    expect(result.establishments.every((item) => item.name.startsWith("DÉMONSTRATION"))).toBe(true);
    expect(result.products.every((item) => item.name.startsWith("DÉMONSTRATION"))).toBe(true);
    expect(result.warnings.join(" ")).toContain("fictives");
  });
});
