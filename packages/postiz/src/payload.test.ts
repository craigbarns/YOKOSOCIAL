import { describe, expect, it } from "vitest";

import { buildPostizSchedulePayload } from "./payload.js";
import { schedulePostInputSchema } from "./schemas.js";

describe("Postiz payload", () => {
  it("traduit un Reel Instagram en post_type post avec une seule vidéo", () => {
    const payload = buildPostizSchedulePayload({
      integrationId: "ig-1",
      identifier: "instagram-standalone",
      content: "Coulisses YokoSushi",
      format: "reel",
      media: [
        {
          id: "video-1",
          path: "https://media.example.test/reel.mp4",
          contentType: "video/mp4"
        }
      ],
      scheduledAt: "2026-08-05T18:00:00.000+02:00"
    });

    expect(payload).toEqual({
      type: "schedule",
      date: "2026-08-05T16:00:00.000Z",
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: "ig-1" },
          value: [
            {
              content: "Coulisses YokoSushi",
              image: [{ id: "video-1", path: "https://media.example.test/reel.mp4" }]
            }
          ],
          settings: { __type: "instagram-standalone", post_type: "post" }
        }
      ]
    });
  });

  it("rejette les formats Facebook non garantis par l'API publique", () => {
    const result = schedulePostInputSchema.safeParse({
      integrationId: "fb-1",
      identifier: "facebook",
      content: "Story",
      format: "story",
      media: [
        {
          id: "image-1",
          path: "https://media.example.test/story.png",
          contentType: "image/png"
        }
      ],
      scheduledAt: "2026-08-05T18:00:00.000Z"
    });

    expect(result.success).toBe(false);
  });
});
