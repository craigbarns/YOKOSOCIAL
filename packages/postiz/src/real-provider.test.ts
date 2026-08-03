import { describe, expect, it, vi } from "vitest";

import { PostizProviderError } from "./errors.js";
import { RealPostizProvider } from "./real-provider.js";
import type { SchedulePostInput } from "./schemas.js";

const API_KEY = "test-secret-postiz-key";

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

function facebookPost(): SchedulePostInput {
  return {
    integrationId: "facebook-integration",
    identifier: "facebook",
    content: "Commandez votre plateau YokoSushi.",
    format: "image",
    media: [
      {
        id: "media-1",
        path: "https://uploads.postiz.example/plateau.png",
        contentType: "image/png"
      }
    ],
    scheduledAt: "2026-08-05T18:00:00.000Z",
    linkUrl: "https://www.yokosushi.fr/commande"
  };
}

describe("RealPostizProvider", () => {
  it("envoie le token brut dans Authorization, sans Bearer", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ connected: true }));
    const provider = new RealPostizProvider({
      baseUrl: "https://api.postiz.com/public/v1/",
      apiKey: API_KEY,
      fetch: fetcher
    });

    await expect(provider.testConnection()).resolves.toMatchObject({
      connected: true,
      mode: "real"
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://api.postiz.com/public/v1/is-connected");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(API_KEY);
    expect(headers.get("Authorization")).not.toContain("Bearer");
    expect(init?.redirect).toBe("error");
  });

  it("uploade en multipart sans imposer manuellement Content-Type", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: "upload-1",
        name: "plateau.png",
        path: "https://uploads.postiz.com/plateau.png"
      })
    );
    const provider = new RealPostizProvider({
      baseUrl: "https://api.postiz.com/public/v1",
      apiKey: API_KEY,
      fetch: fetcher
    });

    const uploaded = await provider.uploadMedia({
      file: new Blob(["valid-png-fixture"], { type: "image/png" }),
      fileName: "plateau.png",
      contentType: "image/png"
    });

    expect(uploaded).toMatchObject({ id: "upload-1", contentType: "image/png" });
    const init = fetcher.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(init?.body).toBeInstanceOf(FormData);
    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.get("Authorization")).toBe(API_KEY);
  });

  it("programme un seul compte et valide le tableau d'identifiants retourné", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse([{ postId: "remote-post-1", integration: "facebook-integration" }])
      );
    const provider = new RealPostizProvider({
      baseUrl: "https://api.postiz.com/public/v1",
      apiKey: API_KEY,
      fetch: fetcher
    });

    await expect(provider.schedulePost(facebookPost())).resolves.toEqual({
      outcome: "SCHEDULED",
      remotePosts: [{ remotePostId: "remote-post-1", integrationId: "facebook-integration" }],
      scheduledAt: "2026-08-05T18:00:00.000Z"
    });

    const init = fetcher.mock.calls[0]?.[1];
    expect(typeof init?.body).toBe("string");
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({ type: "schedule", shortLink: false, tags: [] });
    expect(body).toHaveProperty("posts.0.settings", {
      __type: "facebook",
      url: "https://www.yokosushi.fr/commande"
    });
  });

  it("retourne UNKNOWN_REMOTE_STATE sans retenter après une erreur réseau", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(`timeout ${API_KEY}`));
    const provider = new RealPostizProvider({
      baseUrl: "https://api.postiz.com/public/v1",
      apiKey: API_KEY,
      fetch: fetcher
    });

    const result = await provider.schedulePost(facebookPost());

    expect(result).toMatchObject({ outcome: "UNKNOWN_REMOTE_STATE", retryAllowed: false });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("considère également un 5xx de création comme ambigu", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: "upstream" }, { status: 502 }));
    const provider = new RealPostizProvider({
      baseUrl: "https://api.postiz.com/public/v1",
      apiKey: API_KEY,
      fetch: fetcher
    });

    await expect(provider.schedulePost(facebookPost())).resolves.toMatchObject({
      outcome: "UNKNOWN_REMOTE_STATE",
      retryAllowed: false
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("reste ambigu si Postiz renvoie un compte différent de la cible demandée", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse([{ postId: "remote-post-1", integration: "another-account" }])
      );
    const provider = new RealPostizProvider({
      baseUrl: "https://api.postiz.com/public/v1",
      apiKey: API_KEY,
      fetch: fetcher
    });

    await expect(provider.schedulePost(facebookPost())).resolves.toMatchObject({
      outcome: "UNKNOWN_REMOTE_STATE",
      retryAllowed: false
    });
  });

  it("classe un 429 explicite comme échec connu sans prétendre que l'état a changé", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ message: "rate limited" }, { status: 429 }));
    const provider = new RealPostizProvider({
      baseUrl: "https://api.postiz.com/public/v1",
      apiKey: API_KEY,
      fetch: fetcher
    });

    const failure = await provider.schedulePost(facebookPost()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PostizProviderError);
    expect(failure).toMatchObject({
      code: "RATE_LIMITED",
      retryable: true,
      remoteStateMayHaveChanged: false
    });
  });

  it("annule conservativement par passage à draft et n'utilise jamais DELETE", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: "remote-post-1", state: "DRAFT" }));
    const provider = new RealPostizProvider({
      baseUrl: "https://api.postiz.com/public/v1",
      apiKey: API_KEY,
      fetch: fetcher
    });

    await expect(provider.cancelScheduledPost("remote-post-1")).resolves.toEqual({
      outcome: "CANCELLED",
      remotePostId: "remote-post-1",
      remoteState: "DRAFT"
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toContain("/posts/remote-post-1/status");
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(JSON.stringify({ status: "draft" }));
  });

  it("n'invente pas de statut absent de l'API et signale une inférence", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        posts: [
          {
            id: "remote-post-1",
            content: "Publié",
            publishDate: "2026-08-01T18:00:00.000Z",
            releaseURL: "https://facebook.example/posts/1",
            integration: {
              id: "facebook-integration",
              providerIdentifier: "facebook",
              name: "YokoSushi",
              picture: "https://facebook.example/avatar.png"
            }
          }
        ]
      })
    );
    const provider = new RealPostizProvider({
      baseUrl: "https://api.postiz.com/public/v1",
      apiKey: API_KEY,
      fetch: fetcher
    });

    const status = await provider.getPostStatus({
      remotePostId: "remote-post-1",
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-02T00:00:00.000Z"
    });

    expect(status).toMatchObject({
      status: "PUBLISHED",
      certainty: "INFERRED",
      supportsAuthoritativeRemoteStatus: false,
      evidence: "RELEASE_URL"
    });
  });

  it("normalise les totaux analytics en chaînes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse([
        {
          label: "Likes",
          data: [{ total: 42, date: "2026-08-02" }],
          percentageChange: 5
        }
      ])
    );
    const provider = new RealPostizProvider({
      baseUrl: "https://api.postiz.com/public/v1",
      apiKey: API_KEY,
      fetch: fetcher
    });

    const metrics = await provider.getPostAnalytics("remote-post-1", 30);

    expect(metrics[0]?.data[0]?.total).toBe("42");
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.postiz.com/public/v1/analytics/post/remote-post-1?date=30"
    );
  });

  it("assainit les erreurs HTTP et expose Retry-After sans exposer la clé", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(
          { message: `Authorization: ${API_KEY}`, accessToken: "pos_sensitive" },
          { status: 429, headers: { "Retry-After": "3" } }
        )
      );
    const provider = new RealPostizProvider({
      baseUrl: "https://api.postiz.com/public/v1",
      apiKey: API_KEY,
      fetch: fetcher
    });

    const failure = await provider.listIntegrations().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PostizProviderError);
    expect(failure).toMatchObject({
      code: "RATE_LIMITED",
      retryable: true,
      retryAfterMs: 3_000
    });
    expect(JSON.stringify(failure)).not.toContain(API_KEY);
    expect(JSON.stringify(failure)).not.toContain("pos_sensitive");
  });
});
