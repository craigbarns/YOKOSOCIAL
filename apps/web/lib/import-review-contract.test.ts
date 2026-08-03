import { describe, expect, it } from "vitest";

import {
  importReviewSchema,
  isIngestedMediaReviewStatus,
  mediaDecisionCoverage,
  resolveMediaCandidateIngestion
} from "./import-review-contract";

const mediaCandidate = { kind: "MEDIA_CANDIDATE", sourceUrl: "https://www.yokosushi.fr/a.jpg" };

describe("validation humaine des médias importés", () => {
  it("exige une décision unique et explicite par média", () => {
    const base = {
      organizationId: "org_1",
      dataDecisions: [],
      mediaDecisions: [{ id: "media_1", decision: "APPROVED" as const }]
    };

    expect(importReviewSchema.safeParse(base).success).toBe(true);
    expect(
      importReviewSchema.safeParse({
        ...base,
        mediaDecisions: [...base.mediaDecisions, { id: "media_1", decision: "REJECTED" }]
      }).success
    ).toBe(false);
  });

  it("considère APPROVED, NEEDS_REVIEW et LOW_QUALITY comme des heuristiques à décider", () => {
    expect(["APPROVED", "NEEDS_REVIEW", "LOW_QUALITY"].every(isIngestedMediaReviewStatus)).toBe(
      true
    );
    expect(isIngestedMediaReviewStatus("REJECTED")).toBe(false);
  });

  it("détecte toute décision média manquante ou étrangère", () => {
    expect(
      mediaDecisionCoverage(["media_1", "media_2"], [{ id: "media_1" }, { id: "media_3" }])
    ).toEqual({ complete: false, missingCount: 1, unexpectedCount: 1 });
    expect(
      mediaDecisionCoverage(["media_1", "media_2"], [{ id: "media_2" }, { id: "media_1" }])
    ).toEqual({ complete: true, missingCount: 0, unexpectedCount: 0 });
  });
});

describe("état terminal de l’ingestion média", () => {
  it("conserve les états terminaux fournis par le worker", () => {
    for (const status of ["STORED", "EXACT_DUPLICATE", "FAILED"] as const) {
      expect(
        resolveMediaCandidateIngestion({
          value: { ...mediaCandidate, ingestionStatus: status },
          importStatus: "WAITING_FOR_REVIEW"
        })
      ).toBe(status);
    }
  });

  it("garde un candidat récent en attente puis le classe manquant après le délai", () => {
    const now = new Date("2026-08-03T12:20:00.000Z");
    expect(
      resolveMediaCandidateIngestion({
        value: mediaCandidate,
        importStatus: "WAITING_FOR_REVIEW",
        candidateUpdatedAt: "2026-08-03T12:10:01.000Z",
        now,
        staleAfterMs: 10 * 60_000
      })
    ).toBe("PENDING");
    expect(
      resolveMediaCandidateIngestion({
        value: mediaCandidate,
        importStatus: "WAITING_FOR_REVIEW",
        candidateUpdatedAt: "2026-08-03T12:10:00.000Z",
        now,
        staleAfterMs: 10 * 60_000
      })
    ).toBe("MISSING");
  });

  it("ne déclare jamais manquant pendant un import encore actif", () => {
    expect(
      resolveMediaCandidateIngestion({
        value: mediaCandidate,
        importStatus: "ANALYZING",
        candidateUpdatedAt: "2026-08-03T10:00:00.000Z",
        now: new Date("2026-08-03T12:00:00.000Z"),
        staleAfterMs: 1
      })
    ).toBe("PENDING");
  });
});
