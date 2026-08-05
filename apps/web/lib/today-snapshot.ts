import type { ImportSnapshotStatus, TodaySnapshot } from "@yokosocial/shared";

const IMPORT_STATUS_MAP = {
  PENDING: "RUNNING",
  CRAWLING: "RUNNING",
  ANALYZING: "RUNNING",
  IMPORTING: "RUNNING",
  WAITING_FOR_REVIEW: "NEEDS_REVIEW",
  COMPLETED: "COMPLETED",
  PARTIALLY_COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "FAILED"
} satisfies Record<string, ImportSnapshotStatus>;

export type ImportStatusName = keyof typeof IMPORT_STATUS_MAP;

export type TodayCounts = {
  brandName: string;
  websiteUrl: string | null;
  latestImport: {
    status: ImportStatusName;
    pagesScanned: number;
    productsDetected: number;
    imagesDetected: number;
  } | null;
  pendingProducts: number;
  validatedProducts: number;
  pendingMedia: number;
  validatedMedia: number;
  postsByStatus: Record<string, number>;
  upcoming: Array<{ id: string; title: string; scheduledAt: Date }>;
  connectedSocialAccounts: number;
  appliedCorrections: number;
};

export function buildTodaySnapshot(counts: TodayCounts): TodaySnapshot {
  const latest = counts.latestImport;
  return {
    brandName: counts.brandName,
    websiteUrl: counts.websiteUrl,
    import: {
      status: latest ? (IMPORT_STATUS_MAP[latest.status] ?? "COMPLETED") : "NONE",
      pagesScanned: latest?.pagesScanned ?? 0,
      productsDetected: latest?.productsDetected ?? 0,
      imagesDetected: latest?.imagesDetected ?? 0
    },
    catalog: {
      pendingProducts: counts.pendingProducts,
      pendingMedia: counts.pendingMedia,
      validatedProducts: counts.validatedProducts,
      validatedMedia: counts.validatedMedia
    },
    posts: {
      pendingReview: counts.postsByStatus.PENDING_REVIEW ?? 0,
      approved: counts.postsByStatus.APPROVED ?? 0,
      scheduled: counts.postsByStatus.SCHEDULED ?? 0,
      failed: counts.postsByStatus.FAILED ?? 0
    },
    upcoming: counts.upcoming.map((post) => ({
      id: post.id,
      title: post.title,
      scheduledAt: post.scheduledAt.toISOString()
    })),
    connectedSocialAccounts: counts.connectedSocialAccounts,
    appliedCorrections: counts.appliedCorrections
  };
}
