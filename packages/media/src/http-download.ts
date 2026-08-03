export type MediaHttpFetcher = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type MediaDownloadSleep = (milliseconds: number) => Promise<void>;

/**
 * Structural subset of website-importer's UrlSecurityPolicy.
 *
 * Keeping this small interface in the media package avoids a dependency cycle. A caller can inject
 * the exported UrlSecurityPolicy directly, retaining its exact-host allowlist and DNS/IP checks.
 */
export interface MediaUrlSecurityPolicy {
  assertSafe(rawUrl: string | URL): Promise<URL>;
}

export interface HttpMediaDownloadOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  retries?: number;
  retryDelayMs?: number;
  userAgent?: string;
}

export interface DownloadHttpMediaInput {
  url: string | URL;
  signal?: AbortSignal;
}

export interface DownloadedHttpMedia {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  declaredMimeType?: string;
  contentLength?: number;
  lastModified?: string;
  etag?: string;
  body: Uint8Array;
}

export type MediaDownloadErrorCode =
  | "ABORTED"
  | "EMPTY_RESPONSE"
  | "HTTP_ERROR"
  | "INVALID_OPTIONS"
  | "INVALID_REDIRECT"
  | "NETWORK_ERROR"
  | "REDIRECT_WITHOUT_LOCATION"
  | "RESPONSE_TOO_LARGE"
  | "TIMEOUT"
  | "TOO_MANY_REDIRECTS";

export class MediaDownloadError extends Error {
  readonly code: MediaDownloadErrorCode;
  readonly url: string;
  readonly retryable: boolean;
  readonly statusCode: number | undefined;

  constructor(input: {
    code: MediaDownloadErrorCode;
    message: string;
    url: string;
    retryable: boolean;
    statusCode?: number;
    cause?: unknown;
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = "MediaDownloadError";
    this.code = input.code;
    this.url = input.url;
    this.retryable = input.retryable;
    this.statusCode = input.statusCode;
  }
}

export const DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES = 25 * 1024 * 1024;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_OPTIONS = {
  maxBytes: DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES,
  timeoutMs: 15_000,
  maxRedirects: 3,
  retries: 2,
  retryDelayMs: 250,
  userAgent: "YokoSushiSocialAgent/0.1 media-ingestion"
} as const;

interface NormalizedDownloadOptions {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
  retries: number;
  retryDelayMs: number;
  userAgent: string;
}

type RequestOutcome =
  { kind: "redirect"; location: string } | { kind: "success"; media: DownloadedHttpMedia };

const defaultFetcher: MediaHttpFetcher = (input, init) => globalThis.fetch(input, init);
const defaultSleep: MediaDownloadSleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  field: string
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new MediaDownloadError({
      code: "INVALID_OPTIONS",
      message: `${field} doit être un entier compris entre ${minimum} et ${maximum}.`,
      url: "",
      retryable: false
    });
  }
}

function normalizeOptions(options: HttpMediaDownloadOptions): NormalizedDownloadOptions {
  const normalized = { ...DEFAULT_OPTIONS, ...options };
  assertIntegerInRange(normalized.maxBytes, 1, DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES, "maxBytes");
  assertIntegerInRange(normalized.timeoutMs, 100, 120_000, "timeoutMs");
  assertIntegerInRange(normalized.maxRedirects, 0, 10, "maxRedirects");
  assertIntegerInRange(normalized.retries, 0, 5, "retries");
  assertIntegerInRange(normalized.retryDelayMs, 0, 30_000, "retryDelayMs");
  if (normalized.userAgent.trim().length === 0 || normalized.userAgent.length > 256) {
    throw new MediaDownloadError({
      code: "INVALID_OPTIONS",
      message: "userAgent doit contenir entre 1 et 256 caractères.",
      url: "",
      retryable: false
    });
  }
  return normalized;
}

function normalizeHeaderMimeType(value: string | null): string | undefined {
  const mimeType = value?.split(";", 1)[0]?.trim().toLowerCase();
  return mimeType ? mimeType : undefined;
}

function parseContentLength(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function cancelResponse(response: Response): Promise<void> {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // The connection can already be closed or aborted.
  }
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  url: string
): Promise<Uint8Array> {
  const contentLength = parseContentLength(response.headers.get("content-length"));
  if (contentLength !== undefined && contentLength > maxBytes) {
    await cancelResponse(response);
    throw new MediaDownloadError({
      code: "RESPONSE_TOO_LARGE",
      message: "Le média dépasse la taille maximale autorisée.",
      url,
      retryable: false,
      statusCode: response.status
    });
  }

  if (!response.body) {
    throw new MediaDownloadError({
      code: "EMPTY_RESPONSE",
      message: "La réponse ne contient aucun média.",
      url,
      retryable: false,
      statusCode: response.status
    });
  }

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let received = 0;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new MediaDownloadError({
          code: "RESPONSE_TOO_LARGE",
          message: "Le média dépasse la taille maximale autorisée.",
          url,
          retryable: false,
          statusCode: response.status
        });
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  if (received === 0) {
    throw new MediaDownloadError({
      code: "EMPTY_RESPONSE",
      message: "La réponse ne contient aucun média.",
      url,
      retryable: false,
      statusCode: response.status
    });
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function abortError(url: string, callerSignal: AbortSignal | undefined): MediaDownloadError {
  return callerSignal?.aborted
    ? new MediaDownloadError({
        code: "ABORTED",
        message: "Le téléchargement du média a été annulé.",
        url,
        retryable: false
      })
    : new MediaDownloadError({
        code: "TIMEOUT",
        message: "Le téléchargement du média a dépassé le délai autorisé.",
        url,
        retryable: true
      });
}

export interface HttpMediaDownloaderDependencies {
  securityPolicy: MediaUrlSecurityPolicy;
  fetcher?: MediaHttpFetcher;
  sleep?: MediaDownloadSleep;
}

/** Downloads media bytes after URL validation, with manual and revalidated redirects. */
export class HttpMediaDownloader {
  private readonly options: NormalizedDownloadOptions;
  private readonly fetcher: MediaHttpFetcher;
  private readonly sleep: MediaDownloadSleep;

  constructor(
    private readonly dependencies: HttpMediaDownloaderDependencies,
    options: HttpMediaDownloadOptions = {}
  ) {
    this.options = normalizeOptions(options);
    this.fetcher = dependencies.fetcher ?? defaultFetcher;
    this.sleep = dependencies.sleep ?? defaultSleep;
  }

  async download(input: DownloadHttpMediaInput): Promise<DownloadedHttpMedia> {
    const requestedUrl = input.url instanceof URL ? input.url.href : input.url;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.options.retries; attempt += 1) {
      try {
        return await this.downloadFollowingRedirects(requestedUrl, input.signal);
      } catch (error) {
        lastError = error;
        if (
          !(error instanceof MediaDownloadError) ||
          !error.retryable ||
          attempt === this.options.retries
        ) {
          throw error;
        }
        await this.sleep(Math.min(this.options.retryDelayMs * 2 ** attempt, 30_000));
      }
    }

    throw lastError;
  }

  private async downloadFollowingRedirects(
    requestedUrl: string,
    callerSignal: AbortSignal | undefined
  ): Promise<DownloadedHttpMedia> {
    let currentUrl = requestedUrl;

    for (let redirects = 0; ; redirects += 1) {
      if (callerSignal?.aborted) throw abortError(currentUrl, callerSignal);
      const safeUrl = await this.dependencies.securityPolicy.assertSafe(currentUrl);
      const outcome = await this.requestOnce(safeUrl, requestedUrl, callerSignal);
      if (outcome.kind === "success") return outcome.media;

      if (redirects >= this.options.maxRedirects) {
        throw new MediaDownloadError({
          code: "TOO_MANY_REDIRECTS",
          message: "Le nombre maximal de redirections du média a été dépassé.",
          url: safeUrl.href,
          retryable: false
        });
      }
      try {
        currentUrl = new URL(outcome.location, safeUrl).href;
      } catch (error) {
        throw new MediaDownloadError({
          code: "INVALID_REDIRECT",
          message: "La destination de redirection du média est invalide.",
          url: safeUrl.href,
          retryable: false,
          cause: error
        });
      }
    }
  }

  private async requestOnce(
    safeUrl: URL,
    requestedUrl: string,
    callerSignal: AbortSignal | undefined
  ): Promise<RequestOutcome> {
    const controller = new AbortController();
    const abortFromCaller = (): void => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await this.fetcher(safeUrl, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        headers: {
          accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1",
          "user-agent": this.options.userAgent
        },
        signal: controller.signal
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await cancelResponse(response);
        if (!location) {
          throw new MediaDownloadError({
            code: "REDIRECT_WITHOUT_LOCATION",
            message: "Le serveur a renvoyé une redirection sans destination.",
            url: safeUrl.href,
            retryable: false,
            statusCode: response.status
          });
        }
        return { kind: "redirect", location };
      }

      if (!response.ok) {
        const retryable = RETRYABLE_STATUSES.has(response.status);
        await cancelResponse(response);
        throw new MediaDownloadError({
          code: "HTTP_ERROR",
          message: retryable
            ? "Le serveur du média est temporairement indisponible."
            : "Le média demandé n’est pas disponible.",
          url: safeUrl.href,
          retryable,
          statusCode: response.status
        });
      }

      const body = await readBoundedBody(response, this.options.maxBytes, safeUrl.href);
      const contentLength = parseContentLength(response.headers.get("content-length"));
      const declaredMimeType = normalizeHeaderMimeType(response.headers.get("content-type"));
      const lastModified = response.headers.get("last-modified")?.trim();
      const etag = response.headers.get("etag")?.trim();

      return {
        kind: "success",
        media: {
          requestedUrl,
          finalUrl: safeUrl.href,
          statusCode: response.status,
          ...(declaredMimeType ? { declaredMimeType } : {}),
          ...(contentLength !== undefined ? { contentLength } : {}),
          ...(lastModified ? { lastModified } : {}),
          ...(etag ? { etag } : {}),
          body
        }
      };
    } catch (error) {
      if (error instanceof MediaDownloadError) throw error;
      if (controller.signal.aborted) throw abortError(safeUrl.href, callerSignal);
      throw new MediaDownloadError({
        code: "NETWORK_ERROR",
        message: "Le téléchargement du média a échoué.",
        url: safeUrl.href,
        retryable: true,
        cause: error
      });
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  }
}
