import { describe, expect, it } from "vitest";

import { isProgrammableSocialAccount } from "./social-account";

describe("isProgrammableSocialAccount", () => {
  it("exige un compte connecté et un identifiant d'intégration distant", () => {
    expect(
      isProgrammableSocialAccount({ status: "CONNECTED", remoteIntegrationId: "postiz-123" })
    ).toBe(true);
    expect(isProgrammableSocialAccount({ status: "CONNECTED", remoteIntegrationId: null })).toBe(
      false
    );
    expect(
      isProgrammableSocialAccount({ status: "DISCONNECTED", remoteIntegrationId: "postiz-123" })
    ).toBe(false);
  });
});
