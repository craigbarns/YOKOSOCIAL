import { describe, expect, it } from "vitest";

import { MockPostizProvider } from "./mock-provider.js";
import type { SchedulePostInput } from "./schemas.js";

function instagramPost(scheduledAt: string): SchedulePostInput {
  return {
    integrationId: "mock-instagram-yokosushi",
    identifier: "instagram",
    content: "Un plateau YokoSushi de démonstration 🍣",
    format: "image",
    media: [
      {
        id: "mock-media-existing",
        path: "https://mock.postiz.invalid/uploads/plateau.png",
        contentType: "image/png"
      }
    ],
    scheduledAt
  };
}

describe("MockPostizProvider", () => {
  it("expose des comptes explicitement marqués comme démonstration", async () => {
    const provider = new MockPostizProvider();

    const integrations = await provider.listIntegrations();

    expect(integrations).toHaveLength(2);
    expect(integrations.every((integration) => integration.name.includes("DÉMO"))).toBe(true);
    await expect(provider.testConnection()).resolves.toEqual({
      connected: true,
      provider: "postiz",
      mode: "mock"
    });
  });

  it("génère des uploads et identifiants reproductibles", async () => {
    const provider = new MockPostizProvider();

    const first = await provider.uploadMedia({
      file: new Blob(["png"], { type: "image/png" }),
      fileName: "plateau démo.png",
      contentType: "image/png"
    });
    const second = await provider.uploadMedia({
      file: new Blob(["jpeg"], { type: "image/jpeg" }),
      fileName: "sushi.jpg",
      contentType: "image/jpeg"
    });

    expect(first.id).toBe("mock-media-0001");
    expect(first.path).toContain("plateau%20d%C3%A9mo.png");
    expect(second.id).toBe("mock-media-0002");
  });

  it("simule programmation puis publication réussie avec une horloge injectée", async () => {
    let now = new Date("2026-08-02T10:00:00.000Z");
    const provider = new MockPostizProvider({ now: () => now });
    const input = instagramPost("2026-08-02T12:00:00.000Z");

    const scheduled = await provider.schedulePost(input);
    expect(scheduled).toMatchObject({
      outcome: "SCHEDULED",
      remotePosts: [{ remotePostId: "mock-post-0001" }]
    });

    const before = await provider.getPostStatus({
      remotePostId: "mock-post-0001",
      startDate: "2026-08-02T00:00:00.000Z",
      endDate: "2026-08-03T00:00:00.000Z"
    });
    expect(before.status).toBe("SCHEDULED");

    now = new Date("2026-08-02T12:01:00.000Z");
    const after = await provider.getPostStatus({
      remotePostId: "mock-post-0001",
      startDate: "2026-08-02T00:00:00.000Z",
      endDate: "2026-08-03T00:00:00.000Z"
    });
    expect(after).toMatchObject({
      status: "PUBLISHED",
      certainty: "CONFIRMED",
      evidence: "MOCK_STATE"
    });
    await expect(provider.getPostAnalytics("mock-post-0001", 7)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Likes" })])
    );
  });

  it("simule une erreur connue sans créer de publication", async () => {
    const provider = new MockPostizProvider({ scheduleScenarios: ["submission_error"] });

    await expect(
      provider.schedulePost(instagramPost("2026-08-03T12:00:00.000Z"))
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      remoteStateMayHaveChanged: false
    });
    await expect(
      provider.listPosts({
        startDate: "2026-08-03T00:00:00.000Z",
        endDate: "2026-08-04T00:00:00.000Z"
      })
    ).resolves.toHaveLength(0);
  });

  it("simule un état ambigu sans autoriser la répétition automatique", async () => {
    const provider = new MockPostizProvider({ scheduleScenarios: ["ambiguous"] });

    const result = await provider.schedulePost(instagramPost("2026-08-03T12:00:00.000Z"));

    expect(result).toEqual(
      expect.objectContaining({
        outcome: "UNKNOWN_REMOTE_STATE",
        retryAllowed: false,
        remotePosts: []
      })
    );
    const remotelyAccepted = await provider.listPosts({
      startDate: "2026-08-03T00:00:00.000Z",
      endDate: "2026-08-04T00:00:00.000Z"
    });
    expect(remotelyAccepted).toHaveLength(1);
  });

  it("simule un échec au moment de publier et une annulation conservatrice", async () => {
    const provider = new MockPostizProvider({
      now: () => new Date("2026-08-03T13:00:00.000Z"),
      scheduleScenarios: ["publication_error", "success"]
    });

    await provider.schedulePost(instagramPost("2026-08-03T12:00:00.000Z"));
    const failed = await provider.getPostStatus({
      remotePostId: "mock-post-0001",
      startDate: "2026-08-03T00:00:00.000Z",
      endDate: "2026-08-04T00:00:00.000Z"
    });
    expect(failed.status).toBe("FAILED");

    await provider.schedulePost(instagramPost("2026-08-04T12:00:00.000Z"));
    await expect(provider.cancelScheduledPost("mock-post-0002")).resolves.toEqual({
      outcome: "CANCELLED",
      remotePostId: "mock-post-0002",
      remoteState: "DRAFT"
    });
  });
});
