export type ImportSnapshotStatus = "NONE" | "RUNNING" | "NEEDS_REVIEW" | "COMPLETED" | "FAILED";

export type UpcomingPost = {
  id: string;
  title: string;
  scheduledAt: string;
};

export type TodaySnapshot = {
  brandName: string;
  websiteUrl: string | null;
  import: {
    status: ImportSnapshotStatus;
    pagesScanned: number;
    productsDetected: number;
    imagesDetected: number;
  };
  catalog: {
    pendingProducts: number;
    pendingMedia: number;
    validatedProducts: number;
    validatedMedia: number;
  };
  posts: {
    pendingReview: number;
    approved: number;
    scheduled: number;
    failed: number;
  };
  upcoming: UpcomingPost[];
  connectedSocialAccounts: number;
  appliedCorrections: number;
};

export type NextAction =
  | { kind: "IMPORT_WEBSITE"; websiteUrl: string | null }
  | {
      kind: "IMPORT_RUNNING";
      pagesScanned: number;
      productsDetected: number;
      imagesDetected: number;
    }
  | { kind: "IMPORT_FAILED" }
  | { kind: "FIX_FAILED_POSTS"; count: number }
  | { kind: "REVIEW_CATALOG"; products: number; media: number }
  | { kind: "REVIEW_POSTS"; count: number; estimatedMinutes: number }
  | { kind: "CONNECT_SOCIAL" }
  | { kind: "ALL_CLEAR"; nextScheduledAt: string | null };

/** Environ 36 secondes par publication, jamais moins d’une minute annoncée. */
function estimateMinutes(count: number): number {
  return Math.max(1, Math.round(count * 0.6));
}

/**
 * Traduit l’état du compte en la seule chose à faire maintenant.
 * L’ordre des tests EST la règle produit : ce qui bloque la publication passe avant
 * ce qui l’améliore.
 */
export function resolveNextAction(snapshot: TodaySnapshot): NextAction {
  if (snapshot.import.status === "FAILED") {
    return { kind: "IMPORT_FAILED" };
  }
  if (snapshot.import.status === "NONE") {
    return { kind: "IMPORT_WEBSITE", websiteUrl: snapshot.websiteUrl };
  }
  if (snapshot.import.status === "RUNNING") {
    return {
      kind: "IMPORT_RUNNING",
      pagesScanned: snapshot.import.pagesScanned,
      productsDetected: snapshot.import.productsDetected,
      imagesDetected: snapshot.import.imagesDetected
    };
  }
  if (snapshot.posts.failed > 0) {
    return { kind: "FIX_FAILED_POSTS", count: snapshot.posts.failed };
  }
  if (snapshot.catalog.pendingProducts > 0 || snapshot.catalog.pendingMedia > 0) {
    return {
      kind: "REVIEW_CATALOG",
      products: snapshot.catalog.pendingProducts,
      media: snapshot.catalog.pendingMedia
    };
  }
  if (snapshot.posts.pendingReview > 0) {
    return {
      kind: "REVIEW_POSTS",
      count: snapshot.posts.pendingReview,
      estimatedMinutes: estimateMinutes(snapshot.posts.pendingReview)
    };
  }
  if (snapshot.connectedSocialAccounts === 0) {
    return { kind: "CONNECT_SOCIAL" };
  }
  return { kind: "ALL_CLEAR", nextScheduledAt: snapshot.upcoming[0]?.scheduledAt ?? null };
}
