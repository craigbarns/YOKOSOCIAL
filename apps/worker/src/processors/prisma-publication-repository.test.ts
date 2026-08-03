import { describe, expect, it } from "vitest";

import { publicationAttemptTiming } from "./prisma-publication-repository.js";

const startedAt = new Date("2026-08-03T10:00:00.000Z");

describe("publicationAttemptTiming", () => {
  it("diffère un retry jusqu'à nextAttemptAt sans autoriser de nouvelle mutation", () => {
    const nextAttemptAt = new Date("2026-08-03T10:05:00.000Z");

    expect(
      publicationAttemptTiming({
        status: "PENDING",
        expectedStatus: "PENDING",
        updatedAt: new Date("2026-08-03T09:59:00.000Z"),
        nextAttemptAt,
        startedAt
      })
    ).toEqual({ kind: "DEFERRED", retryAt: nextAttemptAt });
  });

  it("diffère un job PROCESSING jusqu'à l'expiration exacte de son lease", () => {
    const updatedAt = new Date("2026-08-03T09:59:50.000Z");

    expect(
      publicationAttemptTiming({
        status: "PROCESSING",
        expectedStatus: "PENDING",
        updatedAt,
        nextAttemptAt: null,
        startedAt
      })
    ).toEqual({
      kind: "DEFERRED",
      retryAt: new Date("2026-08-03T10:00:20.000Z")
    });
  });

  it("signale un lease expiré au lieu de relancer directement l'appel distant", () => {
    expect(
      publicationAttemptTiming({
        status: "PROCESSING",
        expectedStatus: "PENDING",
        updatedAt: new Date("2026-08-03T09:59:29.999Z"),
        nextAttemptAt: null,
        startedAt
      })
    ).toEqual({ kind: "LEASE_EXPIRED" });
  });
});
