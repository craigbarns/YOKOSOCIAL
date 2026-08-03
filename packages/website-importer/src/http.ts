import { UrlSecurityError, type UrlSecurityPolicy } from "./security.js";

export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type Sleep = (milliseconds: number) => Promise<void>;

export interface SafeHttpClientOptions {
  timeoutMs: number;
  retries: number;
  maxRedirects: number;
  delayMs: number;
  maxResponseBytes: number;
  userAgent: string;
}

export interface GetTextOptions {
  accept?: string;
  maxBytes?: number;
  signal?: AbortSignal;
}

export interface SafeHttpResponse {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
  lastModified?: string;
  body: string;
}

export class CrawlerHttpError extends Error {
  readonly code: string;
  readonly url: string;
  readonly retryable: boolean;
  readonly statusCode: number | undefined;

  constructor(code: string, message: string, url: string, retryable: boolean, statusCode?: number) {
    super(message);
    this.name = "CrawlerHttpError";
    this.code = code;
    this.url = url;
    this.retryable = retryable;
    this.statusCode = statusCode;
  }
}

const defaultFetcher: Fetcher = (input, init) => globalThis.fetch(input, init);
const defaultSleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function isRetryableStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

async function cancelBody(response: Response): Promise<void> {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // The connection may already be closed. Nothing else should be read from it.
  }
}

async function readLimitedBody(response: Response, maxBytes: number, url: string): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    await cancelBody(response);
    throw new CrawlerHttpError(
      "RESPONSE_TOO_LARGE",
      "La réponse dépasse la taille maximale autorisée.",
      url,
      false,
      response.status
    );
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let result = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new CrawlerHttpError(
          "RESPONSE_TOO_LARGE",
          "La réponse dépasse la taille maximale autorisée.",
          url,
          false,
          response.status
        );
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}

function abortError(url: string, signal: AbortSignal | undefined): CrawlerHttpError {
  if (signal?.aborted) {
    return new CrawlerHttpError("ABORTED", "L’import a été annulé.", url, false);
  }
  return new CrawlerHttpError("TIMEOUT", "La requête a dépassé le délai autorisé.", url, true);
}

export class SsrfSafeHttpClient {
  private requestGate: Promise<void> = Promise.resolve();
  private lastRequestStartedAt = 0;

  constructor(
    private readonly securityPolicy: UrlSecurityPolicy,
    private readonly options: SafeHttpClientOptions,
    private readonly fetcher: Fetcher = defaultFetcher,
    private readonly sleep: Sleep = defaultSleep,
    private readonly now: () => number = Date.now
  ) {}

  async getText(rawUrl: string | URL, options: GetTextOptions = {}): Promise<SafeHttpResponse> {
    const requestedUrl = rawUrl instanceof URL ? rawUrl.href : rawUrl;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.options.retries; attempt += 1) {
      try {
        return await this.requestFollowingRedirects(requestedUrl, options);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof CrawlerHttpError && error.retryable;
        if (!retryable || attempt === this.options.retries) throw error;
        await this.sleep(Math.min(250 * 2 ** attempt, 5_000));
      }
    }

    throw lastError;
  }

  private async requestFollowingRedirects(
    requestedUrl: string,
    options: GetTextOptions
  ): Promise<SafeHttpResponse> {
    let currentUrl = requestedUrl;

    for (let redirects = 0; ; redirects += 1) {
      const safeUrl = await this.securityPolicy.assertSafe(currentUrl);
      await this.waitForRequestTurn();
      const response = await this.fetchOnce(safeUrl, options);

      if (isRedirect(response.status)) {
        const location = response.headers.get("location");
        await cancelBody(response);
        if (!location) {
          throw new CrawlerHttpError(
            "REDIRECT_WITHOUT_LOCATION",
            "Le serveur a renvoyé une redirection sans destination.",
            safeUrl.href,
            false,
            response.status
          );
        }
        if (redirects >= this.options.maxRedirects) {
          throw new CrawlerHttpError(
            "TOO_MANY_REDIRECTS",
            "Le nombre maximal de redirections a été dépassé.",
            safeUrl.href,
            false,
            response.status
          );
        }
        currentUrl = new URL(location, safeUrl).href;
        continue;
      }

      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        await cancelBody(response);
        throw new CrawlerHttpError(
          "HTTP_ERROR",
          retryable
            ? "Le serveur est temporairement indisponible."
            : "La ressource demandée n’est pas disponible.",
          safeUrl.href,
          retryable,
          response.status
        );
      }

      const maxBytes = options.maxBytes ?? this.options.maxResponseBytes;
      const body = await readLimitedBody(response, maxBytes, safeUrl.href);
      const lastModified = response.headers.get("last-modified");
      return {
        requestedUrl,
        finalUrl: safeUrl.href,
        statusCode: response.status,
        contentType: response.headers.get("content-type") ?? "",
        ...(lastModified ? { lastModified } : {}),
        body
      };
    }
  }

  private async fetchOnce(url: URL, options: GetTextOptions): Promise<Response> {
    const controller = new AbortController();
    const abortFromCaller = (): void => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abortFromCaller();
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      return await this.fetcher(url, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        headers: {
          accept: options.accept ?? "text/html,application/json;q=0.9,text/plain;q=0.8",
          "user-agent": this.options.userAgent
        },
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) throw abortError(url.href, options.signal);
      if (error instanceof UrlSecurityError || error instanceof CrawlerHttpError) throw error;
      throw new CrawlerHttpError("NETWORK_ERROR", "La connexion au site a échoué.", url.href, true);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private async waitForRequestTurn(): Promise<void> {
    const turn = this.requestGate.then(async () => {
      const remaining = this.lastRequestStartedAt + this.options.delayMs - this.now();
      if (remaining > 0) await this.sleep(remaining);
      this.lastRequestStartedAt = this.now();
    });
    this.requestGate = turn.catch(() => undefined);
    await turn;
  }
}
