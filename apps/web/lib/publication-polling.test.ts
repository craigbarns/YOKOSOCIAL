import { describe, expect, it } from "vitest";

import { pollingIntervalLabel, publicationPollingInterval } from "./publication-polling";

const now = Date.parse("2026-08-03T10:00:00.000Z");

describe("publicationPollingInterval", () => {
  it("ne poll pas une liste sans travail de publication actif", () => {
    expect(
      publicationPollingInterval([{ status: "APPROVED", scheduledAt: null }], now)
    ).toBeUndefined();
  });

  it("suit rapidement une publication en cours de traitement", () => {
    expect(publicationPollingInterval([{ status: "PUBLISHING", scheduledAt: null }], now)).toBe(
      5_000
    );
  });

  it("suit une tâche en attente sans marteler les API", () => {
    expect(
      publicationPollingInterval(
        [
          {
            status: "SCHEDULED",
            scheduledAt: "2026-08-10T10:00:00.000Z",
            publicationJobs: [{ status: "PENDING" }]
          }
        ],
        now
      )
    ).toBe(15_000);
  });

  it("ralentit fortement le suivi d'une programmation lointaine", () => {
    expect(
      publicationPollingInterval(
        [{ status: "SCHEDULED", scheduledAt: "2026-08-10T10:00:00.000Z" }],
        now
      )
    ).toBe(5 * 60_000);
  });

  it("accélère le suivi dans la fenêtre proche de publication", () => {
    expect(
      publicationPollingInterval(
        [{ status: "SCHEDULED", scheduledAt: "2026-08-03T10:20:00.000Z" }],
        now
      )
    ).toBe(15_000);
  });
});

describe("pollingIntervalLabel", () => {
  it("formate les intervalles courts et longs", () => {
    expect(pollingIntervalLabel(15_000)).toBe("15 s");
    expect(pollingIntervalLabel(300_000)).toBe("5 min");
  });
});
