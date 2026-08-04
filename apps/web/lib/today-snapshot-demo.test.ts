import { describe, expect, it } from "vitest";

import { emptyDemoState, type DemoState } from "./demo-state";
import { buildDemoTodaySnapshot } from "./today-snapshot-demo";

function demoState(overrides: Partial<DemoState> = {}): DemoState {
  return { ...emptyDemoState, hydrated: true, ...overrides };
}

const summary = {
  pagesScanned: 12,
  establishmentsDetected: 2,
  productsDetected: 42,
  categoriesDetected: 6,
  imagesDetected: 80,
  imagesRetained: 64,
  duplicatesDetected: 4,
  smallImages: 12,
  errorsCount: 0,
  validationRequired: 3,
  demo: true as const
};

describe("buildDemoTodaySnapshot", () => {
  it("part d’un import inexistant sur un état vierge", () => {
    const snapshot = buildDemoTodaySnapshot(demoState());
    expect(snapshot.import.status).toBe("NONE");
  });

  it("passe en RUNNING pendant l’analyse", () => {
    const snapshot = buildDemoTodaySnapshot(
      demoState({ import: { ...emptyDemoState.import, running: true, step: "pages", progress: 40 } })
    );
    expect(snapshot.import.status).toBe("RUNNING");
  });

  it("demande la validation du catalogue tant que l’import n’est pas confirmé", () => {
    const snapshot = buildDemoTodaySnapshot(
      demoState({ import: { ...emptyDemoState.import, summary, confirmed: false } })
    );
    expect(snapshot.import.status).toBe("NEEDS_REVIEW");
    expect(snapshot.catalog.pendingProducts).toBe(42);
    expect(snapshot.catalog.pendingMedia).toBe(64);
  });

  it("bascule le catalogue en validé après confirmation", () => {
    const snapshot = buildDemoTodaySnapshot(
      demoState({ import: { ...emptyDemoState.import, summary, confirmed: true } })
    );
    expect(snapshot.import.status).toBe("COMPLETED");
    expect(snapshot.catalog).toEqual({
      pendingProducts: 0,
      pendingMedia: 0,
      validatedProducts: 42,
      validatedMedia: 64
    });
  });

  it("compte les publications de démonstration par statut", () => {
    const snapshot = buildDemoTodaySnapshot(
      demoState({
        import: { ...emptyDemoState.import, summary, confirmed: true },
        posts: [
          { id: "p1", status: "PENDING_REVIEW" },
          { id: "p2", status: "PENDING_REVIEW" },
          { id: "p3", status: "SCHEDULED", scheduledAt: "2026-08-11T10:00:00.000Z", title: "Makis" }
        ] as DemoState["posts"]
      })
    );
    expect(snapshot.posts.pendingReview).toBe(2);
    expect(snapshot.posts.scheduled).toBe(1);
    expect(snapshot.upcoming).toEqual([
      { id: "p3", title: "Makis", scheduledAt: "2026-08-11T10:00:00.000Z" }
    ]);
  });

  it("considère un compte social connecté en démonstration", () => {
    const snapshot = buildDemoTodaySnapshot(demoState());
    expect(snapshot.connectedSocialAccounts).toBe(1);
  });
});
