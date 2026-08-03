import { describe, expect, it, vi } from "vitest";

import {
  HttpMediaDownloader,
  type MediaHttpFetcher,
  type MediaUrlSecurityPolicy
} from "./http-download.js";

class ExactHostPolicy implements MediaUrlSecurityPolicy {
  readonly calls: string[] = [];

  constructor(private readonly allowedHost: string) {}

  assertSafe(rawUrl: string | URL): Promise<URL> {
    const url = rawUrl instanceof URL ? new URL(rawUrl.href) : new URL(rawUrl);
    this.calls.push(url.href);
    if (url.protocol !== "https:" || url.hostname !== this.allowedHost) {
      throw new Error(`URL bloquée : ${url.href}`);
    }
    url.hash = "";
    return Promise.resolve(url);
  }
}

describe("téléchargement HTTP média", () => {
  it("télécharge en binaire avec des options fetch sans cookies ni redirection automatique", async () => {
    const body = Buffer.from("image-binaire");
    const policy = new ExactHostPolicy("www.yokosushi.fr");
    const fetcher = vi.fn<MediaHttpFetcher>((_input, init) => {
      expect(init?.redirect).toBe("manual");
      expect(init?.credentials).toBe("omit");
      expect(init?.referrerPolicy).toBe("no-referrer");
      return Promise.resolve(
        new Response(body, {
          headers: {
            "content-type": "image/png; charset=binary",
            "content-length": String(body.byteLength),
            etag: '"media-v1"'
          }
        })
      );
    });
    const downloader = new HttpMediaDownloader({ securityPolicy: policy, fetcher }, { retries: 0 });

    const result = await downloader.download({
      url: "https://www.yokosushi.fr/images/plateau.png#fragment"
    });

    expect(Buffer.from(result.body)).toEqual(body);
    expect(result.declaredMimeType).toBe("image/png");
    expect(result.etag).toBe('"media-v1"');
    expect(result.finalUrl).not.toContain("#fragment");
    expect(policy.calls).toEqual(["https://www.yokosushi.fr/images/plateau.png#fragment"]);
  });

  it("revalide la destination de chaque redirection avant le second fetch", async () => {
    const policy = new ExactHostPolicy("www.yokosushi.fr");
    const fetcher = vi.fn<MediaHttpFetcher>(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://metadata.internal/latest/credentials" }
        })
      )
    );
    const downloader = new HttpMediaDownloader({ securityPolicy: policy, fetcher }, { retries: 0 });

    await expect(
      downloader.download({ url: "https://www.yokosushi.fr/images/source.jpg" })
    ).rejects.toThrow("URL bloquée");
    expect(policy.calls).toEqual([
      "https://www.yokosushi.fr/images/source.jpg",
      "https://metadata.internal/latest/credentials"
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refuse immédiatement un Content-Length trop grand", async () => {
    const policy = new ExactHostPolicy("www.yokosushi.fr");
    const fetcher = vi.fn<MediaHttpFetcher>(() =>
      Promise.resolve(
        new Response(Buffer.from("court"), {
          headers: { "content-length": "1000" }
        })
      )
    );
    const downloader = new HttpMediaDownloader(
      { securityPolicy: policy, fetcher },
      { maxBytes: 10, retries: 0 }
    );

    await expect(
      downloader.download({ url: "https://www.yokosushi.fr/images/large.jpg" })
    ).rejects.toMatchObject({
      code: "RESPONSE_TOO_LARGE",
      retryable: false
    });
  });

  it("interrompt aussi un flux dont la taille réelle dépasse la limite annoncée", async () => {
    const policy = new ExactHostPolicy("www.yokosushi.fr");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
        controller.close();
      }
    });
    const fetcher = vi.fn<MediaHttpFetcher>(() =>
      Promise.resolve(
        new Response(stream, {
          headers: { "content-length": "8" }
        })
      )
    );
    const downloader = new HttpMediaDownloader(
      { securityPolicy: policy, fetcher },
      { maxBytes: 10, retries: 0 }
    );

    await expect(
      downloader.download({ url: "https://www.yokosushi.fr/images/chunked.jpg" })
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });

  it("borne le nombre de redirections", async () => {
    const policy = new ExactHostPolicy("www.yokosushi.fr");
    const fetcher = vi.fn<MediaHttpFetcher>((input) => {
      const url =
        input instanceof URL
          ? input
          : input instanceof Request
            ? new URL(input.url)
            : new URL(input);
      const next = Number(url.searchParams.get("n") ?? "0") + 1;
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: `/images/loop?n=${next}` }
        })
      );
    });
    const downloader = new HttpMediaDownloader(
      { securityPolicy: policy, fetcher },
      { maxRedirects: 1, retries: 0 }
    );

    await expect(
      downloader.download({ url: "https://www.yokosushi.fr/images/loop?n=0" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REDIRECTS" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(policy.calls).toHaveLength(2);
  });
});
