import { z } from "zod";

export const INGESTED_MEDIA_REVIEW_STATUSES = ["APPROVED", "NEEDS_REVIEW", "LOW_QUALITY"] as const;

export const MEDIA_INGESTION_STALE_AFTER_MS = 15 * 60 * 1_000;

export type ImportMediaDecision = "APPROVED" | "REJECTED";
export type MediaCandidateIngestionStatus =
  "PENDING" | "STORED" | "EXACT_DUPLICATE" | "FAILED" | "MISSING";

const decisionSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    decision: z.enum(["APPROVED", "REJECTED"])
  })
  .strict();

function uniqueDecisionIds(decisions: readonly { id: string }[], context: z.RefinementCtx): void {
  if (new Set(decisions.map(({ id }) => id)).size !== decisions.length) {
    context.addIssue({
      code: "custom",
      message: "Une même ressource ne peut recevoir qu’une décision."
    });
  }
}

export const importReviewSchema = z
  .object({
    organizationId: z.string().trim().min(1).max(100),
    dataDecisions: z.array(decisionSchema).max(50_000),
    mediaDecisions: z.array(decisionSchema).max(50_000)
  })
  .strict()
  .superRefine((value, context) => {
    uniqueDecisionIds(value.dataDecisions, context);
    uniqueDecisionIds(value.mediaDecisions, context);
  });

export function isIngestedMediaReviewStatus(
  status: string
): status is (typeof INGESTED_MEDIA_REVIEW_STATUSES)[number] {
  return (INGESTED_MEDIA_REVIEW_STATUSES as readonly string[]).includes(status);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function parsedTime(value: Date | string | null | undefined): number | undefined {
  if (!value) return undefined;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

export function resolveMediaCandidateIngestion(input: {
  value: unknown;
  importStatus: string;
  candidateUpdatedAt?: Date | string | null;
  importCompletedAt?: Date | string | null;
  now?: Date;
  staleAfterMs?: number;
}): MediaCandidateIngestionStatus | undefined {
  const value = objectValue(input.value);
  if (value?.kind !== "MEDIA_CANDIDATE") return undefined;

  const rawStatus = typeof value.ingestionStatus === "string" ? value.ingestionStatus : undefined;
  if (rawStatus === "STORED" || rawStatus === "EXACT_DUPLICATE" || rawStatus === "FAILED") {
    return rawStatus;
  }

  if (["PENDING", "CRAWLING", "ANALYZING", "IMPORTING"].includes(input.importStatus)) {
    return "PENDING";
  }

  const referenceTime = parsedTime(input.candidateUpdatedAt) ?? parsedTime(input.importCompletedAt);
  const staleAfterMs = input.staleAfterMs ?? MEDIA_INGESTION_STALE_AFTER_MS;
  const now = (input.now ?? new Date()).getTime();
  if (referenceTime === undefined || now - referenceTime >= staleAfterMs) return "MISSING";
  return "PENDING";
}

export function mediaDecisionCoverage(
  expectedIds: readonly string[],
  decisions: readonly { id: string }[]
): { complete: boolean; missingCount: number; unexpectedCount: number } {
  const expected = new Set(expectedIds);
  const received = new Set(decisions.map(({ id }) => id));
  let missingCount = 0;
  let unexpectedCount = 0;

  for (const id of expected) {
    if (!received.has(id)) missingCount += 1;
  }
  for (const id of received) {
    if (!expected.has(id)) unexpectedCount += 1;
  }

  return {
    complete: missingCount === 0 && unexpectedCount === 0,
    missingCount,
    unexpectedCount
  };
}
