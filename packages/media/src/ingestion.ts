import { differenceHash, perceptualDistance, sha256 as computeSha256 } from "./hashing.js";
import {
  HttpMediaDownloader,
  type HttpMediaDownloadOptions,
  type MediaDownloadSleep,
  type MediaHttpFetcher,
  type MediaUrlSecurityPolicy
} from "./http-download.js";
import { inspectImage, type MediaInspection } from "./inspection.js";
import type { MediaStorageProvider, StoredMedia } from "./storage.js";

export interface MediaDuplicateRecord {
  id: string;
  sha256: string;
  perceptualHash?: string;
  storageKey?: string;
}

export interface FindExactMediaDuplicatesInput {
  organizationId: string;
  sha256: string;
}

export interface FindPerceptualMediaCandidatesInput {
  organizationId: string;
  perceptualHash: string;
  maxDistance: number;
}

export interface SimilarMediaDuplicate extends MediaDuplicateRecord {
  perceptualHash: string;
  distance: number;
}

export interface PersistMediaIngestionInput {
  organizationId: string;
  requestedSourceUrl: string;
  finalSourceUrl: string;
  sourcePageUrl?: string;
  originalFilename: string;
  downloadedAt: Date;
  declaredMimeType?: string;
  lastModified?: string;
  etag?: string;
  sha256: string;
  perceptualHash: string;
  inspection: MediaInspection;
  storage: StoredMedia;
  similarDuplicates: readonly SimilarMediaDuplicate[];
}

export interface PersistedMediaReference {
  id: string;
}

/**
 * Persistence boundary implemented by the database layer.
 *
 * It deliberately exposes no delete method: disappearance from the source or duplicate detection
 * can mark an asset for review, but ingestion never removes an existing object automatically.
 */
export interface MediaIngestionRepository {
  findExactDuplicates(
    input: FindExactMediaDuplicatesInput
  ): Promise<readonly MediaDuplicateRecord[]>;
  findPerceptualCandidates(
    input: FindPerceptualMediaCandidatesInput
  ): Promise<readonly MediaDuplicateRecord[]>;
  create(input: PersistMediaIngestionInput): Promise<PersistedMediaReference>;
}

export interface IngestHttpMediaInput {
  organizationId: string;
  sourceUrl: string | URL;
  sourcePageUrl?: string;
  originalFilename?: string;
  signal?: AbortSignal;
}

interface BaseMediaIngestionResult {
  requestedSourceUrl: string;
  finalSourceUrl: string;
  originalFilename: string;
  declaredMimeType?: string;
  sha256: string;
  perceptualHash: string;
  inspection: MediaInspection;
}

export interface ExactDuplicateIngestionResult extends BaseMediaIngestionResult {
  outcome: "EXACT_DUPLICATE";
  exactDuplicates: readonly MediaDuplicateRecord[];
}

export interface StoredMediaIngestionResult extends BaseMediaIngestionResult {
  outcome: "STORED";
  mediaId: string;
  storage: StoredMedia;
  similarDuplicates: readonly SimilarMediaDuplicate[];
  requiresReview: boolean;
}

export type HttpMediaIngestionResult = ExactDuplicateIngestionResult | StoredMediaIngestionResult;

export interface HttpMediaIngestionOptions extends HttpMediaDownloadOptions {
  perceptualThreshold?: number;
  storagePrefix?: string;
}

export interface HttpMediaIngestionDependencies {
  securityPolicy: MediaUrlSecurityPolicy;
  repository: MediaIngestionRepository;
  storage: MediaStorageProvider;
  fetcher?: MediaHttpFetcher;
  sleep?: MediaDownloadSleep;
  now?: () => Date;
}

const DEFAULT_PERCEPTUAL_THRESHOLD = 8;
const DEFAULT_STORAGE_PREFIX = "originals";

function normalizePerceptualThreshold(value: number | undefined): number {
  const threshold = value ?? DEFAULT_PERCEPTUAL_THRESHOLD;
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 64) {
    throw new Error("perceptualThreshold doit être un entier compris entre 0 et 64.");
  }
  return threshold;
}

function normalizeStoragePrefix(value: string | undefined): string {
  const prefix = (value ?? DEFAULT_STORAGE_PREFIX).replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (
    prefix.length === 0 ||
    prefix.length > 128 ||
    prefix.includes("..") ||
    !/^[a-zA-Z0-9_/-]+$/.test(prefix)
  ) {
    throw new Error("storagePrefix contient des caractères ou segments non autorisés.");
  }
  return prefix;
}

function sanitizeFilename(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}._() -]/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}

function inferOriginalFilename(
  explicitFilename: string | undefined,
  sourceUrl: string,
  extension: string
): string {
  let filename = explicitFilename?.trim() ?? "";
  if (!filename) {
    try {
      const pathname = new URL(sourceUrl).pathname;
      const segment = pathname.split("/").filter(Boolean).at(-1);
      if (segment) {
        try {
          filename = decodeURIComponent(segment);
        } catch {
          filename = segment;
        }
      }
    } catch {
      // The URL policy owns URL validation; keep a deterministic fallback for the metadata only.
    }
  }
  return sanitizeFilename(filename) || `source.${extension}`;
}

function calculateSimilarDuplicates(
  candidates: readonly MediaDuplicateRecord[],
  sha256: string,
  perceptualHash: string,
  threshold: number
): SimilarMediaDuplicate[] {
  const matches = new Map<string, SimilarMediaDuplicate>();
  for (const candidate of candidates) {
    if (candidate.sha256 === sha256 || !candidate.perceptualHash) continue;
    let distance: number;
    try {
      distance = perceptualDistance(perceptualHash, candidate.perceptualHash);
    } catch {
      // A malformed legacy hash must not make a safe new ingestion fail.
      continue;
    }
    if (distance > threshold) continue;
    const existing = matches.get(candidate.id);
    if (!existing || distance < existing.distance) {
      matches.set(candidate.id, {
        ...candidate,
        perceptualHash: candidate.perceptualHash,
        distance
      });
    }
  }
  return [...matches.values()].sort((left, right) => left.distance - right.distance);
}

function withIngestionWarnings(
  inspection: MediaInspection,
  declaredMimeType: string | undefined,
  similarDuplicates: readonly SimilarMediaDuplicate[]
): MediaInspection {
  const warnings = [...inspection.warnings];
  const hasMimeMismatch =
    declaredMimeType !== undefined && declaredMimeType !== inspection.mimeType;
  if (hasMimeMismatch) {
    warnings.push(
      `Le serveur annonçait ${declaredMimeType}, mais le contenu réel est ${inspection.mimeType}.`
    );
  }
  if (similarDuplicates.length > 0) {
    warnings.push(
      `${similarDuplicates.length} média(s) visuellement proche(s) détecté(s) ; validation requise.`
    );
  }
  const requiresReview = hasMimeMismatch || similarDuplicates.length > 0;
  return {
    ...inspection,
    status: requiresReview && inspection.status === "APPROVED" ? "NEEDS_REVIEW" : inspection.status,
    warnings
  };
}

/**
 * Downloads, inspects and copies an original image into application-owned storage.
 *
 * Exact duplicates are reported without a second upload. Perceptual matches are retained as new
 * assets, flagged for human review and never used as a reason to delete an existing media.
 */
export class HttpMediaIngestionService {
  private readonly downloader: HttpMediaDownloader;
  private readonly perceptualThreshold: number;
  private readonly storagePrefix: string;
  private readonly now: () => Date;

  constructor(
    private readonly dependencies: HttpMediaIngestionDependencies,
    options: HttpMediaIngestionOptions = {}
  ) {
    this.perceptualThreshold = normalizePerceptualThreshold(options.perceptualThreshold);
    this.storagePrefix = normalizeStoragePrefix(options.storagePrefix);
    this.now = dependencies.now ?? (() => new Date());
    this.downloader = new HttpMediaDownloader(
      {
        securityPolicy: dependencies.securityPolicy,
        ...(dependencies.fetcher ? { fetcher: dependencies.fetcher } : {}),
        ...(dependencies.sleep ? { sleep: dependencies.sleep } : {})
      },
      options
    );
  }

  async ingest(input: IngestHttpMediaInput): Promise<HttpMediaIngestionResult> {
    if (!/^[a-zA-Z0-9_-]+$/.test(input.organizationId)) {
      throw new Error("Identifiant organisation invalide.");
    }

    const downloaded = await this.downloader.download({
      url: input.sourceUrl,
      ...(input.signal ? { signal: input.signal } : {})
    });
    const sha256 = computeSha256(downloaded.body);
    const [baseInspection, perceptualHash] = await Promise.all([
      inspectImage(downloaded.body),
      differenceHash(downloaded.body)
    ]);
    const originalFilename = inferOriginalFilename(
      input.originalFilename,
      downloaded.finalUrl,
      baseInspection.extension
    );

    const exactDuplicates = (
      await this.dependencies.repository.findExactDuplicates({
        organizationId: input.organizationId,
        sha256
      })
    ).filter((candidate) => candidate.sha256 === sha256);

    if (exactDuplicates.length > 0) {
      return {
        outcome: "EXACT_DUPLICATE",
        requestedSourceUrl: downloaded.requestedUrl,
        finalSourceUrl: downloaded.finalUrl,
        originalFilename,
        ...(downloaded.declaredMimeType ? { declaredMimeType: downloaded.declaredMimeType } : {}),
        sha256,
        perceptualHash,
        inspection: withIngestionWarnings(baseInspection, downloaded.declaredMimeType, []),
        exactDuplicates
      };
    }

    const perceptualCandidates = await this.dependencies.repository.findPerceptualCandidates({
      organizationId: input.organizationId,
      perceptualHash,
      maxDistance: this.perceptualThreshold
    });
    const similarDuplicates = calculateSimilarDuplicates(
      perceptualCandidates,
      sha256,
      perceptualHash,
      this.perceptualThreshold
    );
    const inspection = withIngestionWarnings(
      baseInspection,
      downloaded.declaredMimeType,
      similarDuplicates
    );
    const relativeStorageKey = `${this.storagePrefix}/${sha256.slice(0, 2)}/${sha256}.${inspection.extension}`;

    // Always copy the downloaded bytes. The source URL remains provenance metadata, never the
    // delivery URL used by the application.
    const storage = await this.dependencies.storage.put({
      organizationId: input.organizationId,
      key: relativeStorageKey,
      body: downloaded.body,
      mimeType: inspection.mimeType
    });
    const persisted = await this.dependencies.repository.create({
      organizationId: input.organizationId,
      requestedSourceUrl: downloaded.requestedUrl,
      finalSourceUrl: downloaded.finalUrl,
      ...(input.sourcePageUrl ? { sourcePageUrl: input.sourcePageUrl } : {}),
      originalFilename,
      downloadedAt: this.now(),
      ...(downloaded.declaredMimeType ? { declaredMimeType: downloaded.declaredMimeType } : {}),
      ...(downloaded.lastModified ? { lastModified: downloaded.lastModified } : {}),
      ...(downloaded.etag ? { etag: downloaded.etag } : {}),
      sha256,
      perceptualHash,
      inspection,
      storage,
      similarDuplicates
    });

    return {
      outcome: "STORED",
      requestedSourceUrl: downloaded.requestedUrl,
      finalSourceUrl: downloaded.finalUrl,
      originalFilename,
      ...(downloaded.declaredMimeType ? { declaredMimeType: downloaded.declaredMimeType } : {}),
      sha256,
      perceptualHash,
      inspection,
      mediaId: persisted.id,
      storage,
      similarDuplicates,
      requiresReview: inspection.status !== "APPROVED"
    };
  }
}
