import {
  MediaDownloadError,
  type HttpMediaIngestionResult,
  type IngestHttpMediaInput
} from "@yokosocial/media";
import type { MediaIngestJobPayload } from "@yokosocial/shared";

export type MediaJobJsonValue =
  null | boolean | number | string | MediaJobJsonValue[] | { [key: string]: MediaJobJsonValue };

export type MediaIngestJobContext = {
  organizationId: string;
  brandId: string;
  websiteImportId: string;
  websiteImportPageId?: string;
  candidateId: string;
  candidateUpdatedAt: Date;
  candidateValue: { [key: string]: MediaJobJsonValue };
  sourceUrl: string;
  sourcePageUrl: string;
  sourceKind?: string;
  categoryHint?: string;
  alt?: string;
  title?: string;
  nearbyText?: string;
  ingestionStatus?: "STORED" | "EXACT_DUPLICATE" | "FAILED";
  persistedMediaId?: string;
};

export interface MediaIngestJobRepository {
  loadContext: (payload: MediaIngestJobPayload) => Promise<MediaIngestJobContext | null>;
  recordOutcome: (input: {
    context: MediaIngestJobContext;
    result: HttpMediaIngestionResult;
    completedAt: Date;
  }) => Promise<boolean>;
  recordFailure: (input: {
    context: MediaIngestJobContext;
    errorCode: string;
    failedAt: Date;
  }) => Promise<void>;
}

export interface MediaIngestor {
  ingest: (input: IngestHttpMediaInput) => Promise<HttpMediaIngestionResult>;
}

export interface MediaIngestorFactory {
  create: (context: MediaIngestJobContext) => MediaIngestor;
}

export type MediaIngestProcessorOutcome = {
  status: "STORED" | "EXACT_DUPLICATE" | "ALREADY_PROCESSED";
  websiteImportId: string;
  mediaId?: string;
  exactDuplicateIds: string[];
  similarDuplicateIds: string[];
  countersUpdated: boolean;
};

export class MediaIngestContextError extends Error {
  readonly retryable = false;

  constructor() {
    super("Le média ne correspond pas à un candidat d’import autorisé.");
    this.name = "MediaIngestContextError";
  }
}

export class MediaIngestProcessingError extends Error {
  constructor(
    readonly errorCode: string,
    readonly retryable: boolean
  ) {
    super("L’ingestion du média a échoué.");
    this.name = "MediaIngestProcessingError";
  }
}

function safeError(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof MediaDownloadError) {
    return { code: error.code, retryable: error.retryable };
  }
  return { code: "MEDIA_INGESTION_FAILED", retryable: true };
}

export class MediaIngestProcessor {
  private readonly now: () => Date;

  constructor(
    private readonly repository: MediaIngestJobRepository,
    private readonly ingestorFactory: MediaIngestorFactory,
    now: () => Date = () => new Date()
  ) {
    this.now = now;
  }

  async execute(payload: MediaIngestJobPayload): Promise<MediaIngestProcessorOutcome> {
    let context: MediaIngestJobContext | null;
    try {
      context = await this.repository.loadContext(payload);
    } catch {
      throw new MediaIngestProcessingError("MEDIA_CONTEXT_LOAD_FAILED", true);
    }
    if (!context) throw new MediaIngestContextError();

    if (context.ingestionStatus === "STORED" || context.ingestionStatus === "EXACT_DUPLICATE") {
      return {
        status: "ALREADY_PROCESSED",
        websiteImportId: context.websiteImportId,
        ...(context.persistedMediaId ? { mediaId: context.persistedMediaId } : {}),
        exactDuplicateIds: [],
        similarDuplicateIds: [],
        countersUpdated: false
      };
    }

    try {
      const result = await this.ingestorFactory.create(context).ingest({
        organizationId: context.organizationId,
        sourceUrl: context.sourceUrl,
        sourcePageUrl: context.sourcePageUrl
      });
      const countersUpdated = await this.repository.recordOutcome({
        context,
        result,
        completedAt: this.now()
      });

      if (result.outcome === "EXACT_DUPLICATE") {
        return {
          status: "EXACT_DUPLICATE",
          websiteImportId: context.websiteImportId,
          exactDuplicateIds: result.exactDuplicates.map(({ id }) => id),
          similarDuplicateIds: [],
          countersUpdated
        };
      }
      return {
        status: "STORED",
        websiteImportId: context.websiteImportId,
        mediaId: result.mediaId,
        exactDuplicateIds: [],
        similarDuplicateIds: result.similarDuplicates.map(({ id }) => id),
        countersUpdated
      };
    } catch (error) {
      const safe = safeError(error);
      try {
        await this.repository.recordFailure({
          context,
          errorCode: safe.code,
          failedAt: this.now()
        });
      } catch {
        // The error exposed to BullMQ remains generic even if failure persistence is unavailable.
      }
      throw new MediaIngestProcessingError(safe.code, safe.retryable);
    }
  }
}
