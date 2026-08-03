import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type StoreMediaInput = {
  organizationId: string;
  key: string;
  body: Uint8Array;
  mimeType: string;
};

export type StoredMedia = {
  key: string;
  bytes: number;
  mimeType: string;
  publicUrl?: string;
};

export interface MediaStorageProvider {
  readonly name: string;
  put(input: StoreMediaInput): Promise<StoredMedia>;
  getPublicUrl(key: string): string | undefined;
}

function safeStorageKey(organizationId: string, key: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(organizationId))
    throw new Error("Identifiant organisation invalide.");
  const normalized = key.replaceAll("\\", "/").replace(/^\/+/, "");
  if (normalized.includes("..") || normalized.length === 0)
    throw new Error("Clé de stockage invalide.");
  return `${organizationId}/${normalized}`;
}

export class LocalMediaStorageProvider implements MediaStorageProvider {
  readonly name = "local";

  constructor(
    private readonly rootDirectory: string,
    private readonly publicBaseUrl = "/uploads"
  ) {}

  async put(input: StoreMediaInput): Promise<StoredMedia> {
    const key = safeStorageKey(input.organizationId, input.key);
    const root = resolve(this.rootDirectory);
    const target = resolve(root, key);
    if (!target.startsWith(`${root}${sep}`)) throw new Error("Chemin de stockage hors périmètre.");
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(target, input.body, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      const existing = await readFile(target);
      if (!existing.equals(Buffer.from(input.body))) {
        throw new Error("Une autre donnée occupe déjà cette clé de stockage.");
      }
      // A deterministic SHA-based key can legitimately survive a database failure. Treat the
      // identical object as a successful retry so persistence can repair itself.
    }
    return {
      key,
      bytes: input.body.byteLength,
      mimeType: input.mimeType,
      publicUrl: this.getPublicUrl(key)
    };
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
}

type S3StorageOptions = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
};

export class S3MediaStorageProvider implements MediaStorageProvider {
  readonly name = "s3";
  private readonly client: S3Client;

  constructor(private readonly options: S3StorageOptions) {
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey
      }
    });
  }

  async put(input: StoreMediaInput): Promise<StoredMedia> {
    const key = safeStorageKey(input.organizationId, input.key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.mimeType,
        Metadata: { organizationId: input.organizationId }
      })
    );
    const publicUrl = this.getPublicUrl(key);
    return {
      key,
      bytes: input.body.byteLength,
      mimeType: input.mimeType,
      ...(publicUrl ? { publicUrl } : {})
    };
  }

  getPublicUrl(key: string): string | undefined {
    return this.options.publicBaseUrl
      ? `${this.options.publicBaseUrl.replace(/\/$/, "")}/${key}`
      : undefined;
  }
}
