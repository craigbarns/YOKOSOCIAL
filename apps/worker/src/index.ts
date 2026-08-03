import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DelayedError, Queue, UnrecoverableError, Worker } from "bullmq";
import IORedis from "ioredis";

import {
  MockContentGenerationProvider,
  OpenAIContentGenerationProvider,
  type ContentGenerationProvider
} from "@yokosocial/ai";
import { parseEnv } from "@yokosocial/config";
import {
  HttpMediaIngestionService,
  LocalMediaStorageProvider,
  S3MediaStorageProvider,
  type MediaStorageProvider
} from "@yokosocial/media";
import {
  MockPostizProvider,
  RealPostizProvider,
  type MockScheduleScenario,
  type PostizProvider
} from "@yokosocial/postiz";
import {
  assertSafeJobPayload,
  jobNameSchema,
  mediaIngestJobPayloadSchema,
  tenantJobPayloadSchema,
  websiteImportScanJobPayloadSchema,
  type TenantJobPayload
} from "@yokosocial/shared";
import {
  UrlSecurityPolicy,
  YOKOSUSHI_ALLOWED_HOSTS,
  YokoSushiHttpCrawlerProvider
} from "@yokosocial/website-importer";

import {
  MediaIngestContextError,
  MediaIngestProcessingError,
  MediaIngestProcessor,
  type MediaIngestorFactory
} from "./processors/media-ingest.js";
import { ContentGenerationProcessor } from "./processors/content-generation.js";
import { PrismaMediaIngestJobRepository } from "./processors/prisma-media-ingest-repository.js";
import { PrismaPublicationJobRepository } from "./processors/prisma-publication-repository.js";
import { PrismaWebsiteImportScanRepository } from "./processors/prisma-website-import-repository.js";
import {
  MockPublicationMediaLoader,
  S3PublicPublicationMediaLoader,
  type PublicationMediaLoader
} from "./processors/publication-media-loader.js";
import {
  PublicationProcessingError,
  PublicationReconciliationProcessor,
  PublicationScheduleProcessor,
  type PublicationProcessorOptions,
  type PublicationReconciliationPublisher
} from "./processors/publication.js";
import {
  mediaIngestBullJobId,
  WebsiteImportScanProcessor,
  type MediaIngestJobPublisher
} from "./processors/website-import-scan.js";

const env = parseEnv(process.env);
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

function requiredStorageValue(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Configuration de stockage incomplète : ${name}.`);
  return value;
}

function requiredConfigurationValue(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Configuration obligatoire manquante : ${name}.`);
  return normalized;
}

const postizOrganizationId =
  env.POSTIZ_MODE === "real"
    ? requiredConfigurationValue(process.env.POSTIZ_ORGANIZATION_ID, "POSTIZ_ORGANIZATION_ID")
    : null;

function createMediaStorage(): MediaStorageProvider {
  if (env.STORAGE_MODE === "s3") {
    return new S3MediaStorageProvider({
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      region: env.S3_REGION,
      bucket: requiredStorageValue(env.S3_BUCKET, "S3_BUCKET"),
      accessKeyId: requiredStorageValue(env.S3_ACCESS_KEY, "S3_ACCESS_KEY"),
      secretAccessKey: requiredStorageValue(env.S3_SECRET_KEY, "S3_SECRET_KEY"),
      ...(env.S3_PUBLIC_URL ? { publicBaseUrl: env.S3_PUBLIC_URL } : {})
    });
  }
  return new LocalMediaStorageProvider(resolve(repositoryRoot, "apps/web/public/uploads"));
}

function createContentGenerationProvider(): ContentGenerationProvider {
  if (env.AI_MODE === "real") {
    return new OpenAIContentGenerationProvider({
      apiKey: requiredStorageValue(env.OPENAI_API_KEY, "OPENAI_API_KEY"),
      model: env.OPENAI_MODEL,
      reasoningEffort: "none"
    });
  }
  return new MockContentGenerationProvider();
}

function configuredMockScenario(): MockScheduleScenario {
  const scenario = process.env.POSTIZ_MOCK_SCENARIO;
  if (
    scenario === "success" ||
    scenario === "submission_error" ||
    scenario === "ambiguous" ||
    scenario === "publication_error"
  ) {
    return scenario;
  }
  return "success";
}

function createPostizProvider(): PostizProvider {
  if (env.POSTIZ_MODE === "real") {
    return new RealPostizProvider({
      baseUrl: env.POSTIZ_BASE_URL,
      apiKey: requiredStorageValue(env.POSTIZ_API_KEY, "POSTIZ_API_KEY")
    });
  }
  return new MockPostizProvider({ defaultScheduleScenario: configuredMockScenario() });
}

function createPublicationMediaLoader(provider: PostizProvider): PublicationMediaLoader {
  if (provider.mode === "mock") return new MockPublicationMediaLoader();
  return new S3PublicPublicationMediaLoader({
    publicBaseUrl: requiredStorageValue(env.S3_PUBLIC_URL, "S3_PUBLIC_URL"),
    timeoutMs: env.CRAWLER_TIMEOUT_MS
  });
}

async function processJob(
  rawName: unknown,
  payload: unknown,
  websiteImportProcessor: WebsiteImportScanProcessor,
  mediaIngestProcessor: MediaIngestProcessor,
  contentGenerationProcessor: ContentGenerationProcessor,
  publicationScheduleProcessor: PublicationScheduleProcessor,
  publicationReconciliationProcessor: PublicationReconciliationProcessor
): Promise<unknown> {
  const name = jobNameSchema.parse(rawName);
  switch (name) {
    case "website-import.scan": {
      const parsedPayload = websiteImportScanJobPayloadSchema.parse(payload);
      const result = await websiteImportProcessor.execute(parsedPayload);
      console.info(`[worker] website-import.scan — ${parsedPayload.resourceId} — ${result.status}`);
      return result;
    }
    case "media.ingest": {
      const parsedPayload = mediaIngestJobPayloadSchema.parse(payload);
      try {
        const result = await mediaIngestProcessor.execute(parsedPayload);
        console.info(`[worker] media.ingest — ${parsedPayload.resourceId} — ${result.status}`);
        return result;
      } catch (error) {
        if (
          (error instanceof MediaIngestContextError ||
            error instanceof MediaIngestProcessingError) &&
          !error.retryable
        ) {
          throw new UnrecoverableError(error.message);
        }
        throw error;
      }
    }
    case "content.generate": {
      const parsedPayload = tenantJobPayloadSchema.parse(payload);
      const result = await contentGenerationProcessor.execute(parsedPayload);
      console.info(`[worker] content.generate — ${parsedPayload.resourceId} — ${result.status}`);
      return result;
    }
    case "publication.schedule": {
      const parsedPayload = tenantJobPayloadSchema.parse(payload);
      try {
        const result = await publicationScheduleProcessor.execute(parsedPayload);
        console.info(
          `[worker] publication.schedule — ${parsedPayload.resourceId} — ${result.status}`
        );
        return result;
      } catch (error) {
        if (error instanceof PublicationProcessingError && !error.retryable) {
          throw new UnrecoverableError(error.message);
        }
        throw error;
      }
    }
    case "publication.reconcile": {
      const parsedPayload = tenantJobPayloadSchema.parse(payload);
      try {
        const result = await publicationReconciliationProcessor.execute(parsedPayload);
        console.info(
          `[worker] publication.reconcile — ${parsedPayload.resourceId} — ${result.status}`
        );
        return result;
      } catch (error) {
        if (error instanceof PublicationProcessingError && !error.retryable) {
          throw new UnrecoverableError(error.message);
        }
        throw error;
      }
    }
    case "analytics.sync": {
      const parsedPayload = tenantJobPayloadSchema.parse(payload);
      console.info(`[worker] ${name} — ${parsedPayload.resourceId}`);
      return { ok: true };
    }
  }
}

if (!env.REDIS_URL) {
  console.info(
    "[worker] Mode démonstration : aucun Redis configuré, aucun consommateur de jobs n’est lancé."
  );
} else {
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue<TenantJobPayload>("yokosocial", { connection });
  const mediaStorage = createMediaStorage();
  const mediaJobRepository = new PrismaMediaIngestJobRepository({
    storageProvider: mediaStorage.name,
    ...(env.STORAGE_MODE === "s3" && env.S3_BUCKET ? { storageBucket: env.S3_BUCKET } : {})
  });
  const mediaSecurityPolicy = new UrlSecurityPolicy(YOKOSUSHI_ALLOWED_HOSTS);
  const mediaIngestorFactory: MediaIngestorFactory = {
    create: (context) =>
      new HttpMediaIngestionService(
        {
          securityPolicy: mediaSecurityPolicy,
          repository: mediaJobRepository.createIngestionRepository(context),
          storage: mediaStorage
        },
        {
          timeoutMs: env.CRAWLER_TIMEOUT_MS,
          maxRedirects: env.CRAWLER_MAX_REDIRECTS,
          retries: 2,
          retryDelayMs: 500
        }
      )
  };
  const mediaIngestProcessor = new MediaIngestProcessor(mediaJobRepository, mediaIngestorFactory);
  const mediaPublisher: MediaIngestJobPublisher = {
    publish: async (payload) => {
      const safePayload = mediaIngestJobPayloadSchema.parse(payload);
      assertSafeJobPayload(safePayload);
      const job = await queue.add("media.ingest", safePayload, {
        jobId: mediaIngestBullJobId(safePayload),
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60 },
        removeOnFail: { age: 30 * 24 * 60 * 60 }
      });
      if ((await job.getState()) === "failed") await job.retry();
    }
  };
  const websiteImportProcessor = new WebsiteImportScanProcessor(
    new PrismaWebsiteImportScanRepository(),
    new YokoSushiHttpCrawlerProvider(),
    mediaPublisher,
    {
      crawlerOptions: {
        maxPages: env.CRAWLER_MAX_PAGES,
        concurrency: env.CRAWLER_CONCURRENCY,
        delayMs: env.CRAWLER_DELAY_MS,
        timeoutMs: env.CRAWLER_TIMEOUT_MS,
        maxRedirects: env.CRAWLER_MAX_REDIRECTS
      }
    }
  );
  const contentGenerationProcessor = new ContentGenerationProcessor(
    createContentGenerationProvider()
  );
  const mockScheduleScenario = configuredMockScenario();
  const postizProvider = createPostizProvider();
  const publicationProcessorOptions: PublicationProcessorOptions = {
    ...(postizOrganizationId ? { realOrganizationId: postizOrganizationId } : {}),
    ...(postizProvider.mode === "mock"
      ? {
          mockPublicationOutcome:
            mockScheduleScenario === "publication_error" ? "publication_error" : "success"
        }
      : {})
  };
  const publicationRepository = new PrismaPublicationJobRepository();
  const reconciliationPublisher: PublicationReconciliationPublisher = {
    publish: async (payload, runAt) => {
      const safePayload = tenantJobPayloadSchema.parse(payload);
      assertSafeJobPayload(safePayload);
      await queue.add("publication.reconcile", safePayload, {
        jobId: safePayload.idempotencyKey.replace(/[^a-zA-Z0-9_-]/gu, "-").slice(0, 200),
        delay: Math.max(0, runAt.getTime() - Date.now()),
        attempts: 4,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60 },
        removeOnFail: { age: 30 * 24 * 60 * 60 }
      });
    }
  };
  const publicationScheduleProcessor = new PublicationScheduleProcessor(
    publicationRepository,
    postizProvider,
    createPublicationMediaLoader(postizProvider),
    reconciliationPublisher,
    () => new Date(),
    publicationProcessorOptions
  );
  const publicationReconciliationProcessor = new PublicationReconciliationProcessor(
    publicationRepository,
    postizProvider,
    reconciliationPublisher,
    () => new Date(),
    publicationProcessorOptions
  );
  const worker = new Worker<unknown>(
    "yokosocial",
    async (job) => {
      try {
        return await processJob(
          job.name,
          job.data,
          websiteImportProcessor,
          mediaIngestProcessor,
          contentGenerationProcessor,
          publicationScheduleProcessor,
          publicationReconciliationProcessor
        );
      } catch (error) {
        if (
          error instanceof PublicationProcessingError &&
          error.retryable &&
          error.retryAt &&
          error.retryAt.getTime() > Date.now()
        ) {
          await job.moveToDelayed(error.retryAt.getTime(), job.token);
          throw new DelayedError();
        }
        throw error;
      }
    },
    { connection, concurrency: env.WORKER_CONCURRENCY }
  );

  worker.on("completed", (job) => console.info(`[worker] job ${job.id ?? "?"} terminé`));
  worker.on("failed", (job, error) =>
    console.error(`[worker] job ${job?.id ?? "?"} en erreur : ${error.message}`)
  );

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}
