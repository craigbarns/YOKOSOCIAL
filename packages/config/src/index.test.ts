import { describe, expect, it } from "vitest";

import { parseEnv, redactSecrets } from "./index.js";

describe("configuration", () => {
  it("fonctionne sans secrets en mode démonstration", () => {
    const env = parseEnv({ DEMO_MODE: "true" });
    expect(env.DEMO_MODE).toBe(true);
    expect(env.POSTIZ_MODE).toBe("mock");
  });

  it("refuse un mode réel sans secrets", () => {
    expect(() => parseEnv({ DEMO_MODE: "false" })).toThrow();
  });

  it("désactive le mode démonstration par défaut en production", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow();
  });

  it("exige de lier une clé Postiz réelle à une organisation", () => {
    expect(() =>
      parseEnv({
        DEMO_MODE: "false",
        DATABASE_URL: "postgresql://example.test/yokosocial",
        AUTH_SECRET: "a".repeat(32),
        ENCRYPTION_KEY: `${"A".repeat(43)}=`,
        POSTIZ_MODE: "real",
        POSTIZ_API_KEY: "postiz-test",
        STORAGE_MODE: "s3",
        S3_BUCKET: "media",
        S3_ACCESS_KEY: "access",
        S3_SECRET_KEY: "secret",
        S3_PUBLIC_URL: "https://storage.example.test/media"
      })
    ).toThrow(/POSTIZ_ORGANIZATION_ID/);
  });

  it("expurge les secrets imbriqués", () => {
    expect(redactSecrets({ authorization: "abc", nested: { apiKey: "def", ok: 1 } })).toEqual({
      authorization: "[REDACTED]",
      nested: { apiKey: "[REDACTED]", ok: 1 }
    });
  });
});
