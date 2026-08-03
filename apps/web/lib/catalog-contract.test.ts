import { describe, expect, it } from "vitest";

import {
  mediaListQuerySchema,
  mediaPatchSchema,
  productListQuerySchema,
  productPatchSchema
} from "./catalog-contract";

const productTarget = {
  organizationId: "org_1",
  brandId: "brand_1",
  menuItemId: "menu_1"
};

describe("contrats des API catalogue", () => {
  it("exige toujours un périmètre d’organisation et de marque", () => {
    expect(productListQuerySchema.safeParse({ brandId: "brand_1" }).success).toBe(false);
    expect(mediaListQuerySchema.safeParse({ organizationId: "org_1" }).success).toBe(false);
  });

  it("parse les filtres booléens sans accepter les valeurs ambiguës", () => {
    expect(
      mediaListQuerySchema.parse({
        organizationId: "org_1",
        brandId: "brand_1",
        neverUsed: "true"
      }).neverUsed
    ).toBe(true);
    expect(
      mediaListQuerySchema.safeParse({
        organizationId: "org_1",
        brandId: "brand_1",
        neverUsed: "1"
      }).success
    ).toBe(false);
  });

  it("borne et normalise la recherche paginée côté serveur", () => {
    expect(
      mediaListQuerySchema.parse({
        organizationId: "org_1",
        brandId: "brand_1",
        search: "  plateau saumon  ",
        page: "2",
        limit: "48"
      })
    ).toMatchObject({ search: "plateau saumon", page: 2, limit: 48 });
    expect(
      productListQuerySchema.safeParse({
        organizationId: "org_1",
        brandId: "brand_1",
        limit: "101"
      }).success
    ).toBe(false);
  });

  it("refuse toute modification de prix sans confirmation humaine explicite", () => {
    expect(productPatchSchema.safeParse({ ...productTarget, price: "12.90" }).success).toBe(false);
    expect(
      productPatchSchema.safeParse({
        ...productTarget,
        price: "12.90",
        priceConfirmed: true
      }).success
    ).toBe(true);
  });

  it("refuse les prix numériques, négatifs ou avec plus de deux décimales", () => {
    for (const price of [12.9, "-1.00", "12.999", "100000000.00"]) {
      expect(
        productPatchSchema.safeParse({ ...productTarget, price, priceConfirmed: true }).success
      ).toBe(false);
    }
  });

  it("refuse les associations dupliquées et les corrections vides", () => {
    expect(
      mediaPatchSchema.safeParse({
        organizationId: "org_1",
        brandId: "brand_1",
        mediaAssetId: "media_1",
        establishmentIds: ["est_1", "est_1"]
      }).success
    ).toBe(false);
    expect(productPatchSchema.safeParse(productTarget).success).toBe(false);
  });
});
