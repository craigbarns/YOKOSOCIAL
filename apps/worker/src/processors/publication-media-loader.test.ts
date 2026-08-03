import { describe, expect, it, vi } from "vitest";

import {
  MockPublicationMediaLoader,
  PublicationMediaLoadError,
  S3PublicPublicationMediaLoader,
  type PublicationMediaSource
} from "./publication-media-loader.js";

const publicUrl = "https://storage.example.com/editorial/org_1/sushi.png";

function source(overrides: Partial<PublicationMediaSource> = {}): PublicationMediaSource {
  return {
    id: "media_1",
    organizationId: "org_1",
    originalName: "sushi.png",
    storageProvider: "s3",
    storageKey: "org_1/sushi.png",
    publicUrl,
    mimeType: "image/png",
    byteSize: 8,
    status: "APPROVED",
    ...overrides
  };
}

function pngBody(): ArrayBuffer {
  const buffer = new ArrayBuffer(8);
  new Uint8Array(buffer).set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return buffer;
}

function responseAt(url: string, init: ResponseInit & { body: ArrayBuffer }): Response {
  const response = new Response(init.body, init);
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("S3PublicPublicationMediaLoader", () => {
  it("télécharge une copie S3 sous l’origine et le préfixe exacts", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        responseAt(publicUrl, {
          body: pngBody(),
          status: 200,
          headers: { "content-type": "image/png", "content-length": "8" }
        })
      )
    );
    const loader = new S3PublicPublicationMediaLoader({
      publicBaseUrl: "https://storage.example.com/editorial",
      fetch: fetcher
    });

    const loaded = await loader.load(source());

    expect(loaded).toMatchObject({
      mediaAssetId: "media_1",
      fileName: "sushi.png",
      contentType: "image/png"
    });
    expect(loaded.file.size).toBe(8);
    expect(fetcher).toHaveBeenCalledWith(
      new URL(publicUrl),
      expect.objectContaining({ redirect: "error", cache: "no-store" })
    );
  });

  it("refuse une origine ou un chemin extérieurs avant le réseau", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const loader = new S3PublicPublicationMediaLoader({
      publicBaseUrl: "https://storage.example.com/editorial",
      fetch: fetcher
    });

    await expect(
      loader.load(source({ publicUrl: "https://evil.example/editorial/org_1/sushi.png" }))
    ).rejects.toMatchObject({ code: "MEDIA_URL_OUTSIDE_STORAGE", retryable: false });
    await expect(
      loader.load(source({ publicUrl: "https://storage.example.com/other/sushi.png" }))
    ).rejects.toMatchObject({ code: "MEDIA_URL_OUTSIDE_STORAGE", retryable: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuse une URL du bon stockage qui ne correspond pas exactement au tenant et à la clé", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const loader = new S3PublicPublicationMediaLoader({
      publicBaseUrl: "https://storage.example.com/editorial",
      fetch: fetcher
    });

    await expect(
      loader.load(source({ publicUrl: "https://storage.example.com/editorial/org_2/sushi.png" }))
    ).rejects.toMatchObject({ code: "MEDIA_URL_STORAGE_KEY_MISMATCH", retryable: false });
    await expect(loader.load(source({ storageKey: "org_2/sushi.png" }))).rejects.toMatchObject({
      code: "MEDIA_STORAGE_KEY_INVALID",
      retryable: false
    });
    await expect(
      loader.load(
        source({
          storageKey: "org_1/%2e%2e/org_2/sushi.png",
          publicUrl: "https://storage.example.com/editorial/org_1/%2e%2e/org_2/sushi.png"
        })
      )
    ).rejects.toMatchObject({ code: "MEDIA_STORAGE_KEY_INVALID", retryable: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuse les URLs publiques non HTTPS et les paramètres signés", async () => {
    expect(
      () =>
        new S3PublicPublicationMediaLoader({
          publicBaseUrl: "http://storage.example.com/editorial"
        })
    ).toThrow("HTTPS");
    const loader = new S3PublicPublicationMediaLoader({
      publicBaseUrl: "https://storage.example.com/editorial"
    });
    await expect(
      loader.load(source({ publicUrl: `${publicUrl}?token=secret` }))
    ).rejects.toBeInstanceOf(PublicationMediaLoadError);
  });

  it("contrôle la limite, le MIME HTTP et la signature réelle", async () => {
    const tooLarge = new S3PublicPublicationMediaLoader({
      publicBaseUrl: "https://storage.example.com/editorial",
      maxBytes: 7,
      fetch: () =>
        Promise.resolve(
          responseAt(publicUrl, {
            body: pngBody(),
            status: 200,
            headers: { "content-type": "image/png", "content-length": "8" }
          })
        )
    });
    await expect(tooLarge.load(source())).rejects.toMatchObject({ code: "MEDIA_SIZE_INVALID" });

    const wrongMime = new S3PublicPublicationMediaLoader({
      publicBaseUrl: "https://storage.example.com/editorial",
      fetch: () =>
        Promise.resolve(
          responseAt(publicUrl, {
            body: pngBody(),
            status: 200,
            headers: { "content-type": "image/jpeg", "content-length": "8" }
          })
        )
    });
    await expect(wrongMime.load(source())).rejects.toMatchObject({ code: "MEDIA_MIME_MISMATCH" });

    const wrongSignature = new S3PublicPublicationMediaLoader({
      publicBaseUrl: "https://storage.example.com/editorial",
      fetch: () =>
        Promise.resolve(
          responseAt(publicUrl, {
            body: new ArrayBuffer(8),
            status: 200,
            headers: { "content-type": "image/png", "content-length": "8" }
          })
        )
    });
    await expect(wrongSignature.load(source())).rejects.toMatchObject({
      code: "MEDIA_SIGNATURE_MISMATCH"
    });
  });
});

describe("MockPublicationMediaLoader", () => {
  it("prépare un Blob sans accès réseau ni dépendance S3", async () => {
    const loaded = await new MockPublicationMediaLoader().load(
      source({
        storageProvider: "local",
        publicUrl: "/uploads/media.png",
        originalName: "payload.php"
      })
    );
    expect(loaded.file.size).toBeGreaterThan(0);
    expect(loaded.contentType).toBe("image/png");
    expect(loaded.fileName).toBe("payload.png");
  });
});
