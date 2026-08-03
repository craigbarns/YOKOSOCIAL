import {
  assertSafeJobPayload,
  jobNameSchema,
  type JobName,
  type TenantJobPayload
} from "@yokosocial/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const YOKOSOCIAL_QUEUE_NAME = "yokosocial";

type QueueGlobal = typeof globalThis & {
  __yokosocialQueue?: Queue<TenantJobPayload>;
  __yokosocialRedis?: IORedis;
};

const queueGlobal = globalThis as QueueGlobal;

export class QueueUnavailableError extends Error {
  constructor() {
    super("La file de tâches asynchrones n’est pas configurée.");
    this.name = "QueueUnavailableError";
  }
}

function getQueue(): Queue<TenantJobPayload> {
  if (queueGlobal.__yokosocialQueue) return queueGlobal.__yokosocialQueue;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new QueueUnavailableError();

  const protocol = new URL(redisUrl).protocol;
  if (protocol !== "redis:" && protocol !== "rediss:") throw new QueueUnavailableError();

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  });
  const queue = new Queue<TenantJobPayload>(YOKOSOCIAL_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 }
    }
  });

  queueGlobal.__yokosocialRedis = connection;
  queueGlobal.__yokosocialQueue = queue;
  return queue;
}

function toBullJobId(idempotencyKey: string): string {
  return idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 200);
}

export async function enqueueTenantJob(
  name: JobName,
  payload: TenantJobPayload
): Promise<{ jobId: string }> {
  jobNameSchema.parse(name);
  assertSafeJobPayload(payload);

  const jobId = toBullJobId(payload.idempotencyKey);
  const job = await getQueue().add(name, payload, { jobId });
  return { jobId: job.id ?? jobId };
}

export async function closeJobQueue(): Promise<void> {
  await queueGlobal.__yokosocialQueue?.close();
  await queueGlobal.__yokosocialRedis?.quit();
  delete queueGlobal.__yokosocialQueue;
  delete queueGlobal.__yokosocialRedis;
}
