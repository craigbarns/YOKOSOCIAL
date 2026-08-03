import { describe, expect, it } from "vitest";

import {
  AuthConfigurationError,
  resolveAuthRuntimeConfig,
  resolveTrustedOrigins,
  type AuthEnvironment
} from "./auth";

const validProductionEnvironment: AuthEnvironment = {
  NODE_ENV: "production",
  APP_URL: "https://social.yokosushi.example",
  DATABASE_URL: "postgresql://user:password@db.example.com:5432/postgres",
  AUTH_SECRET: "a".repeat(32)
};

describe("Better Auth runtime configuration", () => {
  it("résout une configuration de production persistante", () => {
    expect(resolveAuthRuntimeConfig(validProductionEnvironment)).toEqual({
      baseURL: "https://social.yokosushi.example",
      secret: "a".repeat(32),
      trustedOrigins: ["https://social.yokosushi.example"]
    });
  });

  it("refuse une configuration sans secret", () => {
    expect(() =>
      resolveAuthRuntimeConfig({
        ...validProductionEnvironment,
        AUTH_SECRET: undefined
      })
    ).toThrow(AuthConfigurationError);
  });

  it("refuse un secret trop court", () => {
    expect(() =>
      resolveAuthRuntimeConfig({
        ...validProductionEnvironment,
        AUTH_SECRET: "trop-court"
      })
    ).toThrow("au moins 32 caractères");
  });

  it("refuse une authentification persistante sans DATABASE_URL", () => {
    expect(() =>
      resolveAuthRuntimeConfig({
        ...validProductionEnvironment,
        DATABASE_URL: undefined
      })
    ).toThrow("DATABASE_URL est requis");
  });

  it("refuse HTTP en production", () => {
    expect(() =>
      resolveAuthRuntimeConfig({
        ...validProductionEnvironment,
        APP_URL: "http://social.yokosushi.example"
      })
    ).toThrow("HTTPS en production");
  });

  it("autorise localhost sans instancier Better Auth en développement", () => {
    expect(
      resolveAuthRuntimeConfig({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://localhost:5432/yokosocial",
        BETTER_AUTH_SECRET: "b".repeat(32)
      }).baseURL
    ).toBe("http://localhost:3000");
  });

  it("normalise et déduplique les origines supplémentaires", () => {
    expect(
      resolveTrustedOrigins({
        ...validProductionEnvironment,
        BETTER_AUTH_TRUSTED_ORIGINS:
          "https://social.yokosushi.example, https://admin.yokosushi.example/"
      })
    ).toEqual(["https://social.yokosushi.example", "https://admin.yokosushi.example"]);
  });
});
