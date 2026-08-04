import { describe, expect, it } from "vitest";

import { resolveNextAction, type TodaySnapshot } from "./next-action.js";

function snapshot(overrides: Partial<TodaySnapshot> = {}): TodaySnapshot {
  return {
    brandName: "Chez Marta",
    websiteUrl: "https://chez-marta.fr",
    import: { status: "COMPLETED", pagesScanned: 12, productsDetected: 42, imagesDetected: 64 },
    catalog: { pendingProducts: 0, pendingMedia: 0, validatedProducts: 42, validatedMedia: 64 },
    posts: { pendingReview: 0, approved: 0, scheduled: 0, failed: 0 },
    upcoming: [],
    connectedSocialAccounts: 1,
    appliedCorrections: 0,
    ...overrides
  };
}

describe("resolveNextAction", () => {
  it("demande le site quand aucun import n'existe", () => {
    const action = resolveNextAction(
      snapshot({
        import: { status: "NONE", pagesScanned: 0, productsDetected: 0, imagesDetected: 0 },
        websiteUrl: "https://chez-marta.fr"
      })
    );
    expect(action).toEqual({ kind: "IMPORT_WEBSITE", websiteUrl: "https://chez-marta.fr" });
  });

  it("montre la progression pendant l'import", () => {
    const action = resolveNextAction(
      snapshot({
        import: { status: "RUNNING", pagesScanned: 12, productsDetected: 28, imagesDetected: 64 }
      })
    );
    expect(action).toEqual({
      kind: "IMPORT_RUNNING",
      pagesScanned: 12,
      productsDetected: 28,
      imagesDetected: 64
    });
  });

  it("signale un import en échec avant toute autre chose", () => {
    const action = resolveNextAction(
      snapshot({
        import: { status: "FAILED", pagesScanned: 3, productsDetected: 0, imagesDetected: 0 },
        posts: { pendingReview: 5, approved: 0, scheduled: 0, failed: 2 }
      })
    );
    expect(action).toEqual({ kind: "IMPORT_FAILED" });
  });

  it("traite les publications en erreur avant le catalogue", () => {
    const action = resolveNextAction(
      snapshot({
        catalog: { pendingProducts: 42, pendingMedia: 64, validatedProducts: 0, validatedMedia: 0 },
        posts: { pendingReview: 5, approved: 0, scheduled: 0, failed: 2 }
      })
    );
    expect(action).toEqual({ kind: "FIX_FAILED_POSTS", count: 2 });
  });

  it("demande la validation du catalogue avant celle des publications", () => {
    const action = resolveNextAction(
      snapshot({
        catalog: { pendingProducts: 42, pendingMedia: 64, validatedProducts: 0, validatedMedia: 0 },
        posts: { pendingReview: 5, approved: 0, scheduled: 0, failed: 0 }
      })
    );
    expect(action).toEqual({ kind: "REVIEW_CATALOG", products: 42, media: 64 });
  });

  it("propose la validation hebdomadaire avec une durée estimée", () => {
    const action = resolveNextAction(
      snapshot({ posts: { pendingReview: 5, approved: 0, scheduled: 0, failed: 0 } })
    );
    expect(action).toEqual({ kind: "REVIEW_POSTS", count: 5, estimatedMinutes: 3 });
  });

  it("estime au moins une minute pour une seule publication", () => {
    const action = resolveNextAction(
      snapshot({ posts: { pendingReview: 1, approved: 0, scheduled: 0, failed: 0 } })
    );
    expect(action).toEqual({ kind: "REVIEW_POSTS", count: 1, estimatedMinutes: 1 });
  });

  it("demande la connexion d'un compte social quand il n'en existe aucun", () => {
    const action = resolveNextAction(snapshot({ connectedSocialAccounts: 0 }));
    expect(action).toEqual({ kind: "CONNECT_SOCIAL" });
  });

  it("annonce la prochaine publication quand tout est en ordre", () => {
    const action = resolveNextAction(
      snapshot({
        posts: { pendingReview: 0, approved: 0, scheduled: 2, failed: 0 },
        upcoming: [
          { id: "post-1", title: "Le plateau du vendredi", scheduledAt: "2026-08-11T10:00:00.000Z" },
          { id: "post-2", title: "Nos makis", scheduledAt: "2026-08-13T10:00:00.000Z" }
        ]
      })
    );
    expect(action).toEqual({
      kind: "ALL_CLEAR",
      nextScheduledAt: "2026-08-11T10:00:00.000Z"
    });
  });

  it("reste en ordre sans aucune publication programmée", () => {
    const action = resolveNextAction(snapshot());
    expect(action).toEqual({ kind: "ALL_CLEAR", nextScheduledAt: null });
  });
});
