import { describe, expect, it } from "vitest";

import {
  assertOrganizationId,
  assertSameOrganization,
  InvalidOrganizationContextError,
  organizationScope
} from "./tenant";

describe("tenant safeguards", () => {
  it("produit un filtre organizationId immuable", () => {
    const scope = organizationScope("org_yokosushi");

    expect(scope).toEqual({ organizationId: "org_yokosushi" });
    expect(Object.isFrozen(scope)).toBe(true);
  });

  it.each([undefined, null, "", "   "])("refuse un organizationId invalide: %s", (value) => {
    expect(() => assertOrganizationId(value)).toThrow(InvalidOrganizationContextError);
  });

  it("bloque une référence appartenant à un autre tenant", () => {
    expect(() => assertSameOrganization("org_a", "org_b", "publication")).toThrow(
      "Accès inter-organisation refusé pour publication."
    );
  });
});
