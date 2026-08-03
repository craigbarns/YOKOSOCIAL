import { POSTIZ_ALLOWED_MIME_TYPES, type PostizAllowedMimeType } from "@yokosocial/postiz";

export const MAX_PUBLICATION_MEDIA_BYTES = 25 * 1024 * 1024;

export type PublicationMediaSource = {
  id: string;
  organizationId: string;
  originalName: string;
  storageProvider: string;
  storageKey: string;
  publicUrl: string | null;
  mimeType: string;
  byteSize: number | null;
  status: string;
};

export type LoadedPublicationMedia = {
  mediaAssetId: string;
  fileName: string;
  contentType: PostizAllowedMimeType;
  file: Blob;
};

export interface PublicationMediaLoader {
  load(source: PublicationMediaSource): Promise<LoadedPublicationMedia>;
}

export class PublicationMediaLoadError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean
  ) {
    super("Le média applicatif ne peut pas être préparé pour la publication.");
    this.name = "PublicationMediaLoadError";
  }
}

type S3PublicMediaLoaderOptions = {
  publicBaseUrl: string;
  fetch?: typeof globalThis.fetch;
  maxBytes?: number;
  timeoutMs?: number;
};

function normalizedPublicBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("S3_PUBLIC_URL doit être une URL absolue valide.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("S3_PUBLIC_URL doit utiliser HTTPS et ne contenir aucun identifiant.");
  }
  if (url.search || url.hash) {
    throw new Error("S3_PUBLIC_URL ne doit contenir ni paramètres ni fragment.");
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url;
}

function isUnderBase(candidate: URL, base: URL): boolean {
  if (
    candidate.protocol !== "https:" ||
    candidate.username ||
    candidate.password ||
    candidate.origin !== base.origin
  ) {
    return false;
  }
  const prefix = base.pathname || "/";
  return prefix === "/"
    ? candidate.pathname.startsWith("/")
    : candidate.pathname === prefix || candidate.pathname.startsWith(`${prefix}/`);
}

function expectedPublicUrl(source: PublicationMediaSource, base: URL): URL {
  const normalizedKey = source.storageKey.replace(/^\/+/, "");
  if (
    !/^[a-zA-Z0-9_-]+$/u.test(source.organizationId) ||
    normalizedKey !== source.storageKey ||
    normalizedKey.includes("\\") ||
    normalizedKey.includes("%") ||
    !normalizedKey.startsWith(`${source.organizationId}/`) ||
    normalizedKey.includes("..") ||
    normalizedKey.includes("?") ||
    normalizedKey.includes("#")
  ) {
    throw new PublicationMediaLoadError("MEDIA_STORAGE_KEY_INVALID", false);
  }
  return new URL(`${base.toString().replace(/\/$/u, "")}/${normalizedKey}`);
}

function allowedMimeType(value: string): PostizAllowedMimeType | undefined {
  const normalized = value.split(";", 1)[0]?.trim().toLowerCase();
  return POSTIZ_ALLOWED_MIME_TYPES.find((candidate) => candidate === normalized);
}

function safeFileName(value: string, mimeType: PostizAllowedMimeType): string {
  const rawLeaf = value.split(/[\\/]/u).at(-1) ?? "";
  const leaf = [...rawLeaf]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();
  const extensions = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/gif": ["gif"],
    "image/webp": ["webp"],
    "image/avif": ["avif"],
    "image/bmp": ["bmp"],
    "image/tiff": ["tif", "tiff"],
    "video/mp4": ["mp4"]
  } as const satisfies Record<PostizAllowedMimeType, readonly string[]>;
  const allowedExtensions = extensions[mimeType];
  const currentExtension = leaf.includes(".") ? leaf.split(".").at(-1)?.toLowerCase() : undefined;
  if (
    leaf &&
    leaf.length <= 255 &&
    currentExtension &&
    allowedExtensions.some((extension) => extension === currentExtension)
  ) {
    return leaf;
  }
  const extension = allowedExtensions[0];
  const stem = leaf
    .replace(/\.[^.]*$/u, "")
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .trim();
  return `${(stem || "media").slice(0, 250 - extension.length)}.${extension}`;
}

function matchesMagicBytes(body: Uint8Array, mimeType: PostizAllowedMimeType): boolean {
  const ascii = (start: number, end: number): string =>
    String.fromCharCode(...body.subarray(start, end));
  switch (mimeType) {
    case "image/jpeg":
      return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
    case "image/png":
      return (
        body.length >= 8 &&
        body[0] === 0x89 &&
        ascii(1, 4) === "PNG" &&
        body[4] === 0x0d &&
        body[5] === 0x0a &&
        body[6] === 0x1a &&
        body[7] === 0x0a
      );
    case "image/gif":
      return body.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(0, 6));
    case "image/webp":
      return body.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/avif":
      return body.length >= 12 && ascii(4, 8) === "ftyp" && /avi[fs]/u.test(ascii(8, 32));
    case "image/bmp":
      return body.length >= 2 && ascii(0, 2) === "BM";
    case "image/tiff":
      return (
        body.length >= 4 &&
        ((ascii(0, 2) === "II" && body[2] === 0x2a && body[3] === 0x00) ||
          (ascii(0, 2) === "MM" && body[2] === 0x00 && body[3] === 0x2a))
      );
    case "video/mp4":
      return body.length >= 12 && ascii(4, 8) === "ftyp";
  }
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 1 || declared > maxBytes) {
      throw new PublicationMediaLoadError("MEDIA_SIZE_INVALID", false);
    }
  }
  if (!response.body) throw new PublicationMediaLoadError("MEDIA_BODY_MISSING", true);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      received += result.value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new PublicationMediaLoadError("MEDIA_TOO_LARGE", false);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (received === 0) throw new PublicationMediaLoadError("MEDIA_EMPTY", false);

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export class S3PublicPublicationMediaLoader implements PublicationMediaLoader {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;

  constructor(options: S3PublicMediaLoaderOptions) {
    this.baseUrl = normalizedPublicBaseUrl(options.publicBaseUrl);
    this.fetcher = options.fetch ?? globalThis.fetch;
    if (!this.fetcher) throw new Error("Une implémentation de fetch est requise.");
    this.maxBytes = options.maxBytes ?? MAX_PUBLICATION_MEDIA_BYTES;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    if (!Number.isInteger(this.maxBytes) || this.maxBytes < 1 || this.maxBytes > 25 * 1024 * 1024) {
      throw new Error("La limite média doit être comprise entre 1 octet et 25 Mo.");
    }
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 120_000) {
      throw new Error("Le timeout média doit être compris entre 1 000 et 120 000 ms.");
    }
  }

  async load(source: PublicationMediaSource): Promise<LoadedPublicationMedia> {
    if (source.storageProvider !== "s3" || !source.publicUrl) {
      throw new PublicationMediaLoadError("MEDIA_NOT_IN_S3", false);
    }
    const expectedMimeType = allowedMimeType(source.mimeType);
    if (!expectedMimeType) throw new PublicationMediaLoadError("MEDIA_MIME_NOT_ALLOWED", false);

    let sourceUrl: URL;
    try {
      sourceUrl = new URL(source.publicUrl);
    } catch {
      throw new PublicationMediaLoadError("MEDIA_URL_INVALID", false);
    }
    if (!isUnderBase(sourceUrl, this.baseUrl) || sourceUrl.search || sourceUrl.hash) {
      throw new PublicationMediaLoadError("MEDIA_URL_OUTSIDE_STORAGE", false);
    }
    const expectedUrl = expectedPublicUrl(source, this.baseUrl);
    if (sourceUrl.href !== expectedUrl.href) {
      throw new PublicationMediaLoadError("MEDIA_URL_STORAGE_KEY_MISMATCH", false);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(sourceUrl, {
        method: "GET",
        headers: { Accept: expectedMimeType },
        redirect: "error",
        cache: "no-store",
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof PublicationMediaLoadError) throw error;
      throw new PublicationMediaLoadError("MEDIA_DOWNLOAD_FAILED", true);
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new PublicationMediaLoadError(
        `MEDIA_HTTP_${response.status}`,
        response.status === 408 || response.status === 429 || response.status >= 500
      );
    }
    if (response.url) {
      const finalUrl = new URL(response.url);
      if (!isUnderBase(finalUrl, this.baseUrl) || finalUrl.href !== sourceUrl.href) {
        throw new PublicationMediaLoadError("MEDIA_REDIRECT_FORBIDDEN", false);
      }
    }
    const responseMimeType = allowedMimeType(response.headers.get("content-type") ?? "");
    if (responseMimeType !== expectedMimeType) {
      throw new PublicationMediaLoadError("MEDIA_MIME_MISMATCH", false);
    }

    const body = await readBoundedBody(response, this.maxBytes);
    if (!matchesMagicBytes(body, expectedMimeType)) {
      throw new PublicationMediaLoadError("MEDIA_SIGNATURE_MISMATCH", false);
    }
    const blobBuffer = new ArrayBuffer(body.byteLength);
    new Uint8Array(blobBuffer).set(body);
    return {
      mediaAssetId: source.id,
      fileName: safeFileName(source.originalName, expectedMimeType),
      contentType: expectedMimeType,
      file: new Blob([blobBuffer], { type: expectedMimeType })
    };
  }
}

export class MockPublicationMediaLoader implements PublicationMediaLoader {
  load(source: PublicationMediaSource): Promise<LoadedPublicationMedia> {
    const contentType = allowedMimeType(source.mimeType);
    if (!contentType) {
      return Promise.reject(new PublicationMediaLoadError("MEDIA_MIME_NOT_ALLOWED", false));
    }
    return Promise.resolve({
      mediaAssetId: source.id,
      fileName: safeFileName(source.originalName, contentType),
      contentType,
      file: new Blob([new Uint8Array([0x59, 0x4f, 0x4b, 0x4f])], { type: contentType })
    });
  }
}
