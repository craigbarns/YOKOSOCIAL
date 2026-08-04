import { describe, expect, it } from "vitest";

import { buildTodaySnapshot, type TodayCounts } from "./today-snapshot";
import type { TodaySnapshot } from "./today-snapshot";

function counts(overrides: Partial<TodayCounts> = {}): TodayCounts {
  return {
    brandName: "Chez Marta",
    websiteUrl: "https://chez-marta.fr",
    latestImport: {
      status: "COMPLETED",
      pagesScanned: 12,
      productsDetected: 42,
      imagesDetected: 64
    },
    pendingProducts: 0,
    validatedProducts: 42,
    pendingMedia: 0,
    validatedMedia: 64,
    postsByStatus: {},
    upcoming: [],
    connectedSocialAccounts: 1,
    appliedCorrections: 0,
    ...overrides
  };
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
describe("buildTodaySnapshot", () => {
  it("traduit l’absence d’import en statut NONE", () => {
    const snapshot: TodaySnapshot = buildTodaySnapshot(counts({ latestImport: null }));
    expect(snapshot.import).toEqual({
      status: "NONE",
      pagesScanned: 0,
      productsDetected: 0,
      imagesDetected: 0
    });
  });

  it.each([
    ["PENDING", "RUNNING"],
    ["CRAWLING", "RUNNING"],
    ["ANALYZING", "RUNNING"],
    ["IMPORTING", "RUNNING"],
    ["WAITING_FOR_REVIEW", "NEEDS_REVIEW"],
    ["COMPLETED", "COMPLETED"],
    ["PARTIALLY_COMPLETED", "COMPLETED"],
    ["FAILED", "FAILED"],
    ["CANCELLED", "FAILED"]
  ])("traduit le statut d’import %s en %s", (prismaStatus, expected) => {
    const snapshot: TodaySnapshot = buildTodaySnapshot(
      counts({
        latestImport: {
          status: prismaStatus,
          pagesScanned: 5,
          productsDetected: 10,
          imagesDetected: 20
        }
      })
    );
    expect(snapshot.import.status).toBe(expected);
  });

  it("compte les publications par statut, zéro par défaut", () => {
    const snapshot: TodaySnapshot = buildTodaySnapshot(
      counts({ postsByStatus: { PENDING_REVIEW: 5, SCHEDULED: 2 } })
    );
    expect(snapshot.posts).toEqual({
      pendingReview: 5,
      approved: 0,
      scheduled: 2,
      failed: 0
    });
  });

  it("convertit les dates de programmation en chaînes ISO", () => {
    const snapshot: TodaySnapshot = buildTodaySnapshot(
      counts({
        upcoming: [
          {
            id: "post-1",
            title: "Le plateau du vendredi",
            scheduledAt: new Date("2026-08-11T10:00:00.000Z")
          }
        ]
      })
    );
    expect(snapshot.upcoming).toEqual([
      { id: "post-1", title: "Le plateau du vendredi", scheduledAt: "2026-08-11T10:00:00.000Z" }
    ]);
  });

  it("reporte le catalogue et la marque sans transformation", () => {
    const snapshot: TodaySnapshot = buildTodaySnapshot(
      counts({ pendingProducts: 42, pendingMedia: 64, validatedProducts: 0, validatedMedia: 0 })
    );
    expect(snapshot.brandName).toBe("Chez Marta");
    expect(snapshot.catalog).toEqual({
      pendingProducts: 42,
      pendingMedia: 64,
      validatedProducts: 0,
      validatedMedia: 0
    });
  });
});
