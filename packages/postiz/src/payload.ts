import type { SchedulePostInput } from "./schemas.js";
import { schedulePostInputSchema, toIsoString } from "./schemas.js";

export interface PostizSchedulePayload {
  type: "schedule";
  date: string;
  shortLink: boolean;
  tags: readonly [];
  posts: ReadonlyArray<{
    integration: { id: string };
    value: ReadonlyArray<{
      content: string;
      image: ReadonlyArray<{ id: string; path: string }>;
    }>;
    settings:
      | { __type: "facebook"; url?: string }
      | {
          __type: "instagram" | "instagram-standalone";
          post_type: "post" | "story";
        };
  }>;
}

export function buildPostizSchedulePayload(input: SchedulePostInput): PostizSchedulePayload {
  const validated = schedulePostInputSchema.parse(input);
  const settings: PostizSchedulePayload["posts"][number]["settings"] =
    validated.identifier === "facebook"
      ? {
          __type: "facebook",
          ...(validated.linkUrl ? { url: validated.linkUrl } : {})
        }
      : {
          __type: validated.identifier,
          post_type: validated.format === "story" ? "story" : "post"
        };

  return {
    type: "schedule",
    date: toIsoString(validated.scheduledAt),
    shortLink: validated.shortLink ?? false,
    tags: [],
    posts: [
      {
        integration: { id: validated.integrationId },
        value: [
          {
            content: validated.content,
            image: validated.media.map(({ id, path }) => ({ id, path }))
          }
        ],
        settings
      }
    ]
  };
}
