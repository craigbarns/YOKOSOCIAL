import { describe, expect, it } from "vitest";

import { assertPostTransition, assertSchedulable, canTransitionPost } from "./workflow.js";

describe("workflow de validation", () => {
  it("autorise le parcours de validation attendu", () => {
    expect(canTransitionPost("DRAFT", "PENDING_REVIEW")).toBe(true);
    expect(canTransitionPost("PENDING_REVIEW", "APPROVED")).toBe(true);
    expect(canTransitionPost("APPROVED", "SCHEDULED")).toBe(true);
  });

  it("interdit la programmation directe d'un brouillon", () => {
    expect(() => assertPostTransition("DRAFT", "SCHEDULED")).toThrow();
    expect(() => assertSchedulable("DRAFT", "version-1")).toThrow();
  });

  it("exige une version approuvée", () => {
    expect(() => assertSchedulable("APPROVED")).toThrow();
    expect(() => assertSchedulable("APPROVED", "version-1")).not.toThrow();
  });
});
