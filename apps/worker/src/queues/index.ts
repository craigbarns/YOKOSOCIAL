import { Job, Queue, Worker } from "bullmq";
import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true
});

export const defaultJobOptions = {
  attempts: 5,
  backoff: {
    type: "exponential" as const,
    delay: 2000 // 2s, 4s, 8s, 16s, 32s
  },
  removeOnComplete: {
    count: 200,
    age: 24 * 3600 // 24h
  },
  removeOnFail: {
    count: 500,
    age: 7 * 24 * 3600 // 7 jours
  }
};

export const postQueue = new Queue("post-publication", {
  connection: redis,
  defaultJobOptions
});

export const importQueue = new Queue("yokosushi-import", {
  connection: redis,
  defaultJobOptions
});

export const analyticsQueue = new Queue("analytics-sync", {
  connection: redis,
  defaultJobOptions
});

export function createWorker(
  queueName: string,
  processor: (job: Job) => Promise<unknown>
) {
  const worker = new Worker(queueName, processor, {
    connection: redis,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "5", 10),
    limiter: {
      max: 10,
      duration: 1000
    }
  });

  worker.on("completed", (job) => {
    console.log(`[Worker:${queueName}] ✅ ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[Worker:${queueName}] ❌ ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`
    );
  });

  worker.on("stalled", (jobId) => {
    console.warn(`[Worker:${queueName}] ⚠️ ${jobId} stalled`);
  });

  return worker;
}
