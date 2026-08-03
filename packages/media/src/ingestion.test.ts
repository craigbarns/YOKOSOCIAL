import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { HttpMediaIngestionService, type MediaIngestionRepository } from "./ingestion.js";
import type { MediaHttpFetcher, MediaUrlSecurityPolicy } from "./http-download.js";
import type { MediaStorageProvider } from "./storage.js";

const sourceUrl = "https://www.yokosushi.fr/media/plateau-source.php";

async function createEditorialPng(): Promise<Buffer> {
  return sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="1200" height="1200" fill="#b51f36"/><circle cx="600" cy="600" r="360" fill="#fff"/><rect x="450" y="450" width="300" height="300" fill="#111"/></svg>'
    )
  )
    .png()
    .toBuffer();
}

function allowYokoPolicy(): MediaUrlSecurityPolicy {
  return {
    assertSafe(rawUrl) {
      const url = rawUrl instanceof URL ? new URL(rawUrl.href) : new URL(rawUrl);
      if (url.protocol !== "https:" || url.hostname !== "www.yokosushi.fr") {
        throw new Error("URL média non autorisée.");
      }
      return Promise.resolve(url);
    }
  };
}

function createStorage() {
  const put = vi.fn<MediaStorageProvider["put"]>((input) =>
    Promise.resolve({
      key: `${input.organizationId}/${input.key}`,
      bytes: input.body.byteLength,
      mimeType: input.mimeType,
      publicUrl: `https://media.yokosocial.test/${input.organizationId}/${input.key}`
    })
  );
  const storage: MediaStorageProvider = {
    name: "memory",
    put,
    getPublicUrl: (key) => `https://media.yokosocial.test/${key}`
  };
  return { storage, put };
}

function createRepository(overrides: Partial<MediaIngestionRepository> = {}) {
  const findExactDuplicates = vi.fn<MediaIngestionRepository["findExactDuplicates"]>(() =>
    Promise.resolve([])
  );
  const findPerceptualCandidates = vi.fn<MediaIngestionRepository["findPerceptualCandidates"]>(() =>
    Promise.resolve([])
  );
  const create = vi.fn<MediaIngestionRepository["create"]>(() =>
    Promise.resolve({ id: "media-created" })
  );
  const repository: MediaIngestionRepository = {
    findExactDuplicates,
    findPerceptualCandidates,
    create,
    ...overrides
  };
  return { repository, findExactDuplicates, findPerceptualCandidates, create };
}

function imageFetcher(body: Uint8Array, declaredMimeType = "image/png"): MediaHttpFetcher {
  return vi.fn<MediaHttpFetcher>(() =>
    Promise.resolve(
      new Response(Buffer.from(body), {
        headers: {
          "content-type": declaredMimeType,
          "content-length": String(body.byteLength),
          "last-modified": "Sun, 02 Aug 2026 10:00:00 GMT"
        }
      })
    )
  );
}

describe("ingestion HTTP média", () => {
  it("utilise le MIME réel, inspecte puis copie l’original vers le stockage applicatif", async () => {
    const image = await createEditorialPng();
    const repository = createRepository();
    const { storage, put } = createStorage();
    const now = new Date("2026-08-02T12:00:00.000Z");
    const service = new HttpMediaIngestionService(
      {
        securityPolicy: allowYokoPolicy(),
        repository: repository.repository,
        storage,
        fetcher: imageFetcher(image, "image/jpeg"),
        now: () => now
      },
      { retries: 0 }
    );

    const result = await service.ingest({
      organizationId: "org_demo",
      sourceUrl,
      sourcePageUrl: "https://www.yokosushi.fr/la-carte"
    });

    expect(result.outcome).toBe("STORED");
    if (result.outcome !== "STORED") throw new Error("Résultat stocké attendu.");
    expect(result.inspection).toMatchObject({
      mimeType: "image/png",
      extension: "png",
      width: 1200,
      height: 1200
    });
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.perceptualHash).toMatch(/^[0-9a-f]{16}$/);
    expect(result.requiresReview).toBe(true);
    expect(result.inspection.warnings.join(" ")).toContain("contenu réel est image/png");
    expect(result.storage.publicUrl).toMatch(/^https:\/\/media\.yokosocial\.test\//);
    expect(result.storage.publicUrl).not.toBe(sourceUrl);

    expect(put).toHaveBeenCalledTimes(1);
    const storedInput = put.mock.calls[0]?.[0];
    expect(storedInput?.mimeType).toBe("image/png");
    expect(Buffer.from(storedInput?.body ?? [])).toEqual(image);
    expect(storedInput?.key).toMatch(/^originals\/[0-9a-f]{2}\/[0-9a-f]{64}\.png$/);
    expect(storedInput?.key).not.toContain("yokosushi.fr");

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        downloadedAt: now,
        requestedSourceUrl: sourceUrl,
        finalSourceUrl: sourceUrl,
        declaredMimeType: "image/jpeg",
        originalFilename: "plateau-source.php"
      })
    );
  });

  it("n’envoie pas une seconde copie lorsqu’un SHA-256 identique existe", async () => {
    const image = await createEditorialPng();
    const exactLookup = vi.fn<MediaIngestionRepository["findExactDuplicates"]>((input) =>
      Promise.resolve([
        {
          id: "media-existing",
          sha256: input.sha256,
          storageKey: "org_demo/originals/existing.png"
        }
      ])
    );
    const repository = createRepository({ findExactDuplicates: exactLookup });
    const { storage, put } = createStorage();
    const service = new HttpMediaIngestionService(
      {
        securityPolicy: allowYokoPolicy(),
        repository: repository.repository,
        storage,
        fetcher: imageFetcher(image)
      },
      { retries: 0 }
    );

    const result = await service.ingest({ organizationId: "org_demo", sourceUrl });

    expect(result.outcome).toBe("EXACT_DUPLICATE");
    if (result.outcome !== "EXACT_DUPLICATE") throw new Error("Doublon exact attendu.");
    expect(result.exactDuplicates.map(({ id }) => id)).toEqual(["media-existing"]);
    expect(put).not.toHaveBeenCalled();
    expect(repository.findPerceptualCandidates).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("conserve un doublon perceptuel comme nouvelle copie mais exige une revue humaine", async () => {
    const image = await createEditorialPng();
    const similarLookup = vi.fn<MediaIngestionRepository["findPerceptualCandidates"]>((input) =>
      Promise.resolve([
        {
          id: "media-similar",
          sha256: "different-sha",
          perceptualHash: input.perceptualHash,
          storageKey: "org_demo/originals/similar.png"
        }
      ])
    );
    const repository = createRepository({ findPerceptualCandidates: similarLookup });
    const { storage, put } = createStorage();
    const service = new HttpMediaIngestionService(
      {
        securityPolicy: allowYokoPolicy(),
        repository: repository.repository,
        storage,
        fetcher: imageFetcher(image)
      },
      { retries: 0, perceptualThreshold: 6 }
    );

    const result = await service.ingest({ organizationId: "org_demo", sourceUrl });

    expect(result.outcome).toBe("STORED");
    if (result.outcome !== "STORED") throw new Error("Résultat stocké attendu.");
    expect(result.similarDuplicates).toEqual([
      expect.objectContaining({ id: "media-similar", distance: 0 })
    ]);
    expect(result.requiresReview).toBe(true);
    expect(put).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        similarDuplicates: [expect.objectContaining({ id: "media-similar", distance: 0 })]
      })
    );
    expect("delete" in repository.repository).toBe(false);
  });

  it("refuse un contenu non image même si le serveur annonce image/jpeg", async () => {
    const repository = createRepository();
    const { storage, put } = createStorage();
    const service = new HttpMediaIngestionService(
      {
        securityPolicy: allowYokoPolicy(),
        repository: repository.repository,
        storage,
        fetcher: imageFetcher(Buffer.from("<html>not an image</html>"), "image/jpeg")
      },
      { retries: 0 }
    );

    await expect(service.ingest({ organizationId: "org_demo", sourceUrl })).rejects.toThrow(
      "Type MIME image non autorisé ou non reconnu"
    );
    expect(put).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });
});
