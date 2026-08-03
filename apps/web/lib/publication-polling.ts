const TRANSIENT_POLL_INTERVAL_MS = 5_000;
const PENDING_POLL_INTERVAL_MS = 15_000;
const DISTANT_POLL_INTERVAL_MS = 5 * 60_000;
const NEAR_SCHEDULE_WINDOW_MS = 30 * 60_000;

type PollablePublication = {
  status: string;
  scheduledAt: string | null;
  publicationJobs?: Array<{ status: string }>;
};

export function publicationPollingInterval(
  posts: readonly PollablePublication[],
  now = Date.now()
): number | undefined {
  const hasTransientPublication = posts.some(
    (post) =>
      post.status === "PUBLISHING" ||
      post.publicationJobs?.some((job) => job.status === "PROCESSING")
  );
  if (hasTransientPublication) return TRANSIENT_POLL_INTERVAL_MS;

  const hasPendingQueueJob = posts.some((post) =>
    post.publicationJobs?.some((job) => job.status === "PENDING")
  );
  if (hasPendingQueueJob) return PENDING_POLL_INTERVAL_MS;

  const scheduledPosts = posts.filter((post) => post.status === "SCHEDULED");
  if (scheduledPosts.length === 0) return undefined;

  const hasNearSchedule = scheduledPosts.some((post) => {
    if (!post.scheduledAt) return false;
    const scheduledTime = new Date(post.scheduledAt).getTime();
    return (
      Number.isFinite(scheduledTime) && Math.abs(scheduledTime - now) <= NEAR_SCHEDULE_WINDOW_MS
    );
  });

  return hasNearSchedule ? PENDING_POLL_INTERVAL_MS : DISTANT_POLL_INTERVAL_MS;
}

export function pollingIntervalLabel(intervalMs: number): string {
  return intervalMs >= 60_000
    ? `${Math.round(intervalMs / 60_000)} min`
    : `${Math.round(intervalMs / 1_000)} s`;
}
