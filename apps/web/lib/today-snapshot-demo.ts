import type { ImportSnapshotStatus, TodaySnapshot, UpcomingPost } from "@yokosocial/shared";

import type { DemoState } from "./demo-state";

const UPCOMING_LIMIT = 3;

function importStatus(state: DemoState): ImportSnapshotStatus {
  if (state.import.running) return "RUNNING";
  if (!state.import.summary) return "NONE";
  return state.import.confirmed ? "COMPLETED" : "NEEDS_REVIEW";
}

function upcomingPosts(state: DemoState): UpcomingPost[] {
  return state.posts
    .flatMap((post) =>
      post.scheduledAt && (post.status === "SCHEDULED" || post.status === "PUBLISHING")
        ? [{ id: post.id, title: post.title, scheduledAt: post.scheduledAt }]
        : []
    )
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
    .slice(0, UPCOMING_LIMIT);
}

export function buildDemoTodaySnapshot(state: DemoState): TodaySnapshot {
  const summary = state.import.summary;
  const confirmed = state.import.confirmed;
  const products = summary?.productsDetected ?? 0;
  const media = summary?.imagesRetained ?? 0;

  const countByStatus = (status: string) =>
    state.posts.filter((post) => post.status === status).length;

  return {
    brandName: state.organization?.name ?? "Votre restaurant",
    websiteUrl: state.organization?.websiteUrl ?? null,
    import: {
      status: importStatus(state),
      pagesScanned: summary?.pagesScanned ?? 0,
      productsDetected: products,
      imagesDetected: summary?.imagesDetected ?? 0
    },
    catalog: {
      pendingProducts: summary && !confirmed ? products : 0,
      pendingMedia: summary && !confirmed ? media : 0,
      validatedProducts: confirmed ? products : 0,
      validatedMedia: confirmed ? media : 0
    },
    posts: {
      pendingReview: countByStatus("PENDING_REVIEW"),
      approved: countByStatus("APPROVED"),
      scheduled: countByStatus("SCHEDULED"),
      failed: countByStatus("FAILED")
    },
    upcoming: upcomingPosts(state),
    connectedSocialAccounts: 1,
    appliedCorrections: 0
  };
}
