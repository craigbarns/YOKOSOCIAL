import { describe, expect, it } from "vitest";

import type { PersistMediaIngestionInput } from "@yokosocial/media";

import type { MediaIngestJobContext } from "./media-ingest.js";
import { buildMediaAssetCreateData } from "./prisma-media-ingest-repository.js";

describe("mapping Prisma d’un média inspecté", () => {
  it("persiste la copie applicative, les hashes, le score et le doublon perceptuel", () => {
    const context: MediaIngestJobContext = {
      organizationId: "org-yoko",
      brandId: "brand-yoko",
      websiteImportId: "import-1",
      websiteImportPageId: "page-carte",
      candidateId: "candidate-1",
      candidateUpdatedAt: new Date("2026-08-02T12:00:00.000Z"),
      candidateValue: {},
      sourceUrl: "https://www.yokosushi.fr/images/plateau.jpg",
      sourcePageUrl: "https://www.yokosushi.fr/carte",
      sourceKind: "IMG_SRC",
      categoryHint: "PRODUCT",
      alt: "Grand plateau de sushis",
      nearbyText: "Plateau et assortiment YokoSushi"
    };
    const input: PersistMediaIngestionInput = {
      organizationId: "org-yoko",
      requestedSourceUrl: context.sourceUrl,
      finalSourceUrl: context.sourceUrl,
      sourcePageUrl: context.sourcePageUrl,
      originalFilename: "plateau.jpg",
      downloadedAt: new Date("2026-08-02T12:10:00.000Z"),
      declaredMimeType: "image/jpeg",
      lastModified: "Sun, 02 Aug 2026 10:00:00 GMT",
      etag: '"image-v1"',
      sha256: "a".repeat(64),
      perceptualHash: "b".repeat(16),
      inspection: {
        mimeType: "image/jpeg",
        extension: "jpg",
        width: 1600,
        height: 1200,
        bytes: 240_000,
        ratio: 1.3333,
        hasAlpha: false,
        qualityScore: 88,
        status: "NEEDS_REVIEW",
        warnings: ["Média visuellement proche détecté."]
      },
      storage: {
        key: "org-yoko/originals/aa/hash.jpg",
        bytes: 240_000,
        mimeType: "image/jpeg",
        publicUrl: "https://media.yokosocial.example/org-yoko/originals/aa/hash.jpg"
      },
      similarDuplicates: [
        {
          id: "media-similar",
          sha256: "c".repeat(64),
          perceptualHash: "d".repeat(16),
          storageKey: "org-yoko/originals/cc/similar.jpg",
          distance: 3
        }
      ]
    };

    const data = buildMediaAssetCreateData(
      context,
      { storageProvider: "s3", storageBucket: "yokosocial-media" },
      input
    );

    expect(data).toMatchObject({
      organizationId: "org-yoko",
      brandId: "brand-yoko",
      websiteImportId: "import-1",
      websiteImportPageId: "page-carte",
      duplicateOfId: "media-similar",
      sourceUrl: context.sourceUrl,
      sourcePageUrl: context.sourcePageUrl,
      storageKey: input.storage.key,
      storageProvider: "s3",
      storageBucket: "yokosocial-media",
      publicUrl: input.storage.publicUrl,
      mimeType: "image/jpeg",
      width: 1600,
      height: 1200,
      byteSize: 240_000n,
      aspectRatio: 1.3333,
      sha256: input.sha256,
      perceptualHash: input.perceptualHash,
      category: "PRODUCT",
      editorialCategory: "PLATTER",
      qualityScore: 88,
      instagramPotentialScore: 88,
      facebookPotentialScore: 88,
      storyPotentialScore: 61,
      carouselPotentialScore: 82,
      reelPotentialScore: 56,
      status: "NEEDS_REVIEW"
    });
    expect(data.publicUrl).not.toBe(data.sourceUrl);
    expect(data.sourceLastModifiedAt).toEqual(new Date("2026-08-02T10:00:00.000Z"));
    expect(data.metadata).toMatchObject({
      sourceKind: "IMG_SRC",
      automatedStatus: "NEEDS_REVIEW",
      hasAlpha: false,
      similarDuplicates: [{ id: "media-similar", distance: 3 }]
    });
  });

  it("ne transforme jamais une recommandation automatique en approbation humaine", () => {
    const context: MediaIngestJobContext = {
      organizationId: "org-yoko",
      brandId: "brand-yoko",
      websiteImportId: "import-1",
      candidateId: "candidate-1",
      candidateUpdatedAt: new Date("2026-08-02T12:00:00.000Z"),
      candidateValue: {},
      sourceUrl: "https://www.yokosushi.fr/images/hero.jpg",
      sourcePageUrl: "https://www.yokosushi.fr/"
    };
    const input: PersistMediaIngestionInput = {
      organizationId: context.organizationId,
      requestedSourceUrl: context.sourceUrl,
      finalSourceUrl: context.sourceUrl,
      sourcePageUrl: context.sourcePageUrl,
      originalFilename: "hero.jpg",
      downloadedAt: new Date("2026-08-02T12:10:00.000Z"),
      sha256: "a".repeat(64),
      perceptualHash: "b".repeat(16),
      inspection: {
        mimeType: "image/jpeg",
        extension: "jpg",
        width: 1600,
        height: 1600,
        bytes: 240_000,
        ratio: 1,
        hasAlpha: false,
        qualityScore: 92,
        status: "APPROVED",
        warnings: []
      },
      storage: {
        key: "org-yoko/originals/aa/hash.jpg",
        bytes: 240_000,
        mimeType: "image/jpeg"
      },
      similarDuplicates: []
    };

    const data = buildMediaAssetCreateData(context, { storageProvider: "s3" }, input);

    expect(data.status).toBe("NEEDS_REVIEW");
    expect(data.metadata).toMatchObject({ automatedStatus: "APPROVED" });
  });
});
