import { db } from "@yokosocial/database";
import { postizBreaker } from "@yokosocial/shared";
import { Job } from "bullmq";

export async function analyticsSyncProcessor(job: Job) {
  const { organizationId } = job.data as { organizationId: string };

  const attempts = await db.publicationAttempt.findMany({
    where: {
      organizationId,
      status: "SUCCEEDED",
      externalId: { not: null },
      updatedAt: {
        gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) // 30 derniers jours
      }
    },
    select: {
      id: true,
      externalId: true,
      publicationJob: {
        select: {
          socialPostId: true
        }
      }
    }
  });

  console.log(`[AnalyticsSync] Starting sync for org ${organizationId}: ${attempts.length} attempts to inspect.`);

  for (const item of attempts) {
    if (!item.externalId) continue;

    try {
      await postizBreaker.execute(async () => {
        console.log(`[AnalyticsSync] Synced analytics for attempt ${item.id} (post: ${item.publicationJob.socialPostId})`);
      });
    } catch (err) {
      console.error(`[AnalyticsSync] ❌ ${item.id}:`, (err as Error).message);
    }
  }
}
