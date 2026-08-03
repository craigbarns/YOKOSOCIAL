import { describe, expect, it, vi } from "vitest";

import {
  MediaDownloadError,
  type HttpMediaIngestionResult,
  type StoredMediaIngestionResult
} from "@yokosocial/media";
import type { MediaIngestJobPayload } from "@yokosocial/shared";

import {
  MediaIngestContextError,
  MediaIngestProcessingError,
  MediaIngestProcessor,
  type MediaIngestJobContext,
  type MediaIngestJobRepository,
  type MediaIngestor,
  type MediaIngestorFactory
} from "./media-ingest.js";

const payload: MediaIngestJobPayload = {
  organizationId: "org-yoko",
  actorId: "user-owner",
  resourceId: `media-${"a".repeat(64)}`,
  idempotencyKey: `media-ingest-import-1-${"a".repeat(64)}`,
  websiteImportId: "import-1",
  brandId: "brand-yoko",
  sourceUrl: "https://www.yokosushi.fr/images/plateau.jpg",
  sourcePageUrl: "https://www.yokosushi.fr/carte"
};

function context(overrides: Partial<MediaIngestJobContext> = {}): MediaIngestJobContext {
  return {
    organizationId: "org-yoko",
    brandId: "brand-yoko",
    websiteImportId: "import-1",
    websiteImportPageId: "page-carte",
    candidateId: "candidate-1",
    candidateUpdatedAt: new Date("2026-08-02T12:00:00.000Z"),
    candidateValue: {
      kind: "MEDIA_CANDIDATE",
      resourceId: payload.resourceId,
      sourceUrl: payload.sourceUrl,
      sourcePageUrl: payload.sourcePageUrl
    },
    sourceUrl: payload.sourceUrl,
    sourcePageUrl: payload.sourcePageUrl,
    sourceKind: "IMG_SRC",
    categoryHint: "PRODUCT",
    alt: "Plateau YokoSushi",
    ...overrides
  };
}

function storedResult(): StoredMediaIngestionResult {
  return {
    outcome: "STORED",
    requestedSourceUrl: payload.sourceUrl,
    finalSourceUrl: payload.sourceUrl,
    originalFilename: "plateau.jpg",
    declaredMimeType: "image/jpeg",
    sha256: "b".repeat(64),
    perceptualHash: "c".repeat(16),
    inspection: {
      mimeType: "image/jpeg",
      extension: "jpg",
      width: 1200,
      height: 900,
      bytes: 120_000,
      ratio: 1.3333,
      hasAlpha: false,
      qualityScore: 82,
      status: "APPROVED",
      warnings: []
    },
    mediaId: "media-created",
    storage: {
      key: "org-yoko/originals/bb/hash.jpg",
      bytes: 120_000,
      mimeType: "image/jpeg",
      publicUrl: "https://media.example/org-yoko/originals/bb/hash.jpg"
    },
    similarDuplicates: [],
    requiresReview: false
  };
}

function exactDuplicateResult(): HttpMediaIngestionResult {
  const stored = storedResult();
  return {
    outcome: "EXACT_DUPLICATE",
    requestedSourceUrl: stored.requestedSourceUrl,
    finalSourceUrl: stored.finalSourceUrl,
    originalFilename: stored.originalFilename,
    ...(stored.declaredMimeType ? { declaredMimeType: stored.declaredMimeType } : {}),
    sha256: stored.sha256,
    perceptualHash: stored.perceptualHash,
    inspection: stored.inspection,
    exactDuplicates: [
      {
        id: "media-existing",
        sha256: stored.sha256,
        storageKey: "org-yoko/originals/existing.jpg"
      }
    ]
  };
}

function createRepository(loaded: MediaIngestJobContext | null = context()) {
  const loadContext = vi.fn<MediaIngestJobRepository["loadContext"]>().mockResolvedValue(loaded);
  const recordOutcome = vi.fn<MediaIngestJobRepository["recordOutcome"]>().mockResolvedValue(true);
  const recordFailure = vi
    .fn<MediaIngestJobRepository["recordFailure"]>()
    .mockResolvedValue(undefined);
  return {
    repository: { loadContext, recordOutcome, recordFailure } satisfies MediaIngestJobRepository,
    loadContext,
    recordOutcome,
    recordFailure
  };
}

function createIngestor(result: HttpMediaIngestionResult = storedResult()) {
  const ingest = vi.fn<MediaIngestor["ingest"]>().mockResolvedValue(result);
  const create = vi.fn<MediaIngestorFactory["create"]>(() => ({ ingest }));
  return { factory: { create } satisfies MediaIngestorFactory, create, ingest };
}

describe("MediaIngestProcessor", () => {
  it("dispatch le candidat tenant-scopé au pipeline média et persiste le résultat", async () => {
    const repository = createRepository();
    const ingestor = createIngestor();
    const now = new Date("2026-08-02T12:10:00.000Z");
    const processor = new MediaIngestProcessor(repository.repository, ingestor.factory, () => now);

    await expect(processor.execute(payload)).resolves.toEqual({
      status: "STORED",
      websiteImportId: "import-1",
      mediaId: "media-created",
      exactDuplicateIds: [],
      similarDuplicateIds: [],
      countersUpdated: true
    });
    expect(ingestor.ingest).toHaveBeenCalledWith({
      organizationId: "org-yoko",
      sourceUrl: payload.sourceUrl,
      sourcePageUrl: payload.sourcePageUrl
    });
    const recorded = repository.recordOutcome.mock.calls[0]?.[0];
    expect(recorded?.context.candidateId).toBe("candidate-1");
    expect(recorded?.result).toMatchObject({ outcome: "STORED", mediaId: "media-created" });
    expect(recorded?.completedAt).toEqual(now);
  });

  it("enregistre un doublon exact sans demander une nouvelle copie", async () => {
    const repository = createRepository();
    const ingestor = createIngestor(exactDuplicateResult());
    const processor = new MediaIngestProcessor(repository.repository, ingestor.factory);

    const outcome = await processor.execute(payload);
    expect(outcome).toMatchObject({
      status: "EXACT_DUPLICATE",
      exactDuplicateIds: ["media-existing"]
    });
    expect(outcome).not.toHaveProperty("mediaId");
    expect(repository.recordOutcome).toHaveBeenCalledOnce();
  });

  it("court-circuite une relance déjà persistée", async () => {
    const repository = createRepository(
      context({ ingestionStatus: "STORED", persistedMediaId: "media-created" })
    );
    const ingestor = createIngestor();
    const processor = new MediaIngestProcessor(repository.repository, ingestor.factory);

    await expect(processor.execute(payload)).resolves.toEqual({
      status: "ALREADY_PROCESSED",
      websiteImportId: "import-1",
      mediaId: "media-created",
      exactDuplicateIds: [],
      similarDuplicateIds: [],
      countersUpdated: false
    });
    expect(ingestor.create).not.toHaveBeenCalled();
    expect(repository.recordOutcome).not.toHaveBeenCalled();
  });

  it("refuse un job sans candidat validé dans le tenant", async () => {
    const repository = createRepository(null);
    const ingestor = createIngestor();
    const processor = new MediaIngestProcessor(repository.repository, ingestor.factory);

    await expect(processor.execute(payload)).rejects.toBeInstanceOf(MediaIngestContextError);
    expect(ingestor.create).not.toHaveBeenCalled();
  });

  it("masque une erreur technique lors du chargement tenant", async () => {
    const repository = createRepository();
    repository.loadContext.mockRejectedValue(
      new Error("DATABASE_URL=postgres://mot-de-passe-interdit")
    );
    const ingestor = createIngestor();
    const processor = new MediaIngestProcessor(repository.repository, ingestor.factory);

    await expect(processor.execute(payload)).rejects.toEqual(
      new MediaIngestProcessingError("MEDIA_CONTEXT_LOAD_FAILED", true)
    );
    expect(ingestor.create).not.toHaveBeenCalled();
  });

  it("conserve uniquement le code sûr d’une erreur HTTP non retentable", async () => {
    const repository = createRepository();
    const error = new MediaDownloadError({
      code: "RESPONSE_TOO_LARGE",
      message: "secret-de-test-ne-doit-pas-sortir",
      url: payload.sourceUrl,
      retryable: false
    });
    const ingest = vi.fn<MediaIngestor["ingest"]>().mockRejectedValue(error);
    const processor = new MediaIngestProcessor(repository.repository, {
      create: () => ({ ingest })
    });

    const execution = processor.execute(payload);
    await expect(execution).rejects.toMatchObject({
      message: "L’ingestion du média a échoué.",
      errorCode: "RESPONSE_TOO_LARGE",
      retryable: false
    });
    const recordedFailure = repository.recordFailure.mock.calls[0]?.[0];
    expect(recordedFailure?.context.candidateId).toBe("candidate-1");
    expect(recordedFailure?.errorCode).toBe("RESPONSE_TOO_LARGE");
    expect(recordedFailure?.failedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(repository.recordFailure.mock.calls)).not.toContain(
      "secret-de-test-ne-doit-pas-sortir"
    );
  });

  it("ne laisse pas une panne de journalisation masquer l’erreur publique sûre", async () => {
    const repository = createRepository();
    repository.recordFailure.mockRejectedValue(
      new Error("S3_SECRET_KEY=ne-doit-jamais-apparaitre")
    );
    const ingest = vi
      .fn<MediaIngestor["ingest"]>()
      .mockRejectedValue(new Error("Erreur S3 contenant un secret"));
    const processor = new MediaIngestProcessor(repository.repository, {
      create: () => ({ ingest })
    });

    await expect(processor.execute(payload)).rejects.toEqual(
      new MediaIngestProcessingError("MEDIA_INGESTION_FAILED", true)
    );
  });
});
