import type { SocialPostStatus } from "./schemas.js";

const transitions: Readonly<Record<SocialPostStatus, readonly SocialPostStatus[]>> = {
  DRAFT: ["PENDING_REVIEW", "CANCELLED"],
  PENDING_REVIEW: ["APPROVED", "REJECTED", "DRAFT", "CANCELLED"],
  APPROVED: ["SCHEDULED", "DRAFT", "CANCELLED"],
  SCHEDULED: ["PUBLISHING", "CANCELLED", "FAILED"],
  PUBLISHING: ["PUBLISHED", "FAILED"],
  PUBLISHED: [],
  REJECTED: ["DRAFT", "CANCELLED"],
  FAILED: ["SCHEDULED", "CANCELLED"],
  CANCELLED: []
};

export class InvalidPostTransitionError extends Error {
  constructor(from: SocialPostStatus, to: SocialPostStatus) {
    super(`Transition de publication interdite : ${from} → ${to}`);
    this.name = "InvalidPostTransitionError";
  }
}

export function canTransitionPost(from: SocialPostStatus, to: SocialPostStatus): boolean {
  return transitions[from].includes(to);
}

export function assertPostTransition(from: SocialPostStatus, to: SocialPostStatus): void {
  if (!canTransitionPost(from, to)) {
    throw new InvalidPostTransitionError(from, to);
  }
}

export function assertSchedulable(status: SocialPostStatus, approvedVersionId?: string): void {
  if (status !== "APPROVED" || !approvedVersionId) {
    throw new Error("La version courante doit être explicitement approuvée avant programmation.");
  }
}
