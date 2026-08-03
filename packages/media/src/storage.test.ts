import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalMediaStorageProvider } from "./storage.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function createProvider() {
  const directory = await mkdtemp(join(tmpdir(), "yokosocial-media-"));
  temporaryDirectories.push(directory);
  return { directory, provider: new LocalMediaStorageProvider(directory) };
}

describe("LocalMediaStorageProvider", () => {
  it("accepte une relance idempotente avec le même contenu", async () => {
    const { directory, provider } = await createProvider();
    const input = {
      organizationId: "org_demo",
      key: "originals/aa/hash.png",
      body: Buffer.from("same-image"),
      mimeType: "image/png"
    };

    await expect(provider.put(input)).resolves.toMatchObject({
      key: "org_demo/originals/aa/hash.png"
    });
    await expect(provider.put(input)).resolves.toMatchObject({
      key: "org_demo/originals/aa/hash.png"
    });
    await expect(readFile(join(directory, "org_demo/originals/aa/hash.png"), "utf8")).resolves.toBe(
      "same-image"
    );
  });

  it("refuse de remplacer une clé existante dont le contenu diffère", async () => {
    const { provider } = await createProvider();
    const base = {
      organizationId: "org_demo",
      key: "originals/aa/hash.png",
      mimeType: "image/png"
    };

    await provider.put({ ...base, body: Buffer.from("first") });
    await expect(provider.put({ ...base, body: Buffer.from("second") })).rejects.toThrow(
      "Une autre donnée occupe déjà cette clé de stockage"
    );
  });
});
