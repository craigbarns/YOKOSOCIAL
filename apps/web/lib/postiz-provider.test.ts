import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "./authorization";
import {
  assertServerPostizTenantScope,
  createServerPostizProvider,
  serverPostizGroupId
} from "./postiz-provider";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Postiz server tenant scope", () => {
  it("laisse le provider mock isolé par les données applicatives", () => {
    vi.stubEnv("POSTIZ_MODE", "mock");

    expect(createServerPostizProvider("org_a").mode).toBe("mock");
  });

  it("refuse en mode réel une organisation différente de celle liée à la clé", () => {
    vi.stubEnv("POSTIZ_MODE", "real");
    vi.stubEnv("POSTIZ_ORGANIZATION_ID", "org_yokosushi");

    expect(() => assertServerPostizTenantScope("org_other")).toThrow(AuthorizationError);
  });

  it("normalise le groupe Postiz optionnel", () => {
    vi.stubEnv("POSTIZ_GROUP_ID", "  group_yokosushi  ");

    expect(serverPostizGroupId()).toBe("group_yokosushi");
  });
});
