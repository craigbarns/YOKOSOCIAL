import { describe, expect, it } from "vitest";

import {
  normalizeYokoSushiWebsiteUrl,
  websiteImportDetailQuerySchema,
  websiteImportRequestSchema
} from "./import-contract";

const validInput = {
  organizationId: "org_1",
  brandId: "brand_1",
  websiteUrl: "https://www.yokosushi.fr"
};

describe("contrat d’import réel", () => {
  it("accepte uniquement les deux hôtes YokoSushi HTTPS", () => {
    expect(websiteImportRequestSchema.safeParse(validInput).success).toBe(true);
    expect(
      websiteImportRequestSchema.safeParse({ ...validInput, websiteUrl: "https://yokosushi.fr/" })
        .success
    ).toBe(true);
    expect(
      websiteImportRequestSchema.safeParse({
        ...validInput,
        websiteUrl: "https://evil.example/?next=https://www.yokosushi.fr"
      }).success
    ).toBe(false);
  });

  it("refuse HTTP, les sous-domaines, les ports et les identifiants intégrés", () => {
    for (const websiteUrl of [
      "http://www.yokosushi.fr",
      "https://cdn.yokosushi.fr",
      "https://www.yokosushi.fr:444",
      "https://user:pass@www.yokosushi.fr"
    ]) {
      expect(websiteImportRequestSchema.safeParse({ ...validInput, websiteUrl }).success).toBe(
        false
      );
    }
  });

  it("retire le fragment avant persistance", () => {
    expect(normalizeYokoSushiWebsiteUrl("https://www.yokosushi.fr/carte#plateaux")).toBe(
      "https://www.yokosushi.fr/carte"
    );
  });

  it("borne et valide les curseurs du détail paginé", () => {
    expect(websiteImportDetailQuerySchema.parse({ organizationId: "org_1" })).toMatchObject({
      includeData: true,
      includeMedia: true,
      pageSize: 200
    });
    expect(
      websiteImportDetailQuerySchema.safeParse({
        organizationId: "org_1",
        dataAfter: "data_200",
        mediaAfter: "media_200",
        includeData: "false",
        pageSize: "250"
      }).success
    ).toBe(true);
    expect(
      websiteImportDetailQuerySchema.safeParse({ organizationId: "org_1", pageSize: "251" }).success
    ).toBe(false);
  });
});
