import { describe, expect, it } from "vitest";

import { readJsonWithLimit } from "./api-access";

describe("readJsonWithLimit", () => {
  it("parse un petit objet JSON", async () => {
    const request = new Request("https://social.example.test/api", {
      method: "POST",
      body: JSON.stringify({ ok: true })
    });

    await expect(readJsonWithLimit(request, 1_024)).resolves.toEqual({ ok: true });
  });

  it("interrompt un corps fragmenté dès que la limite réelle est dépassée", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"value":"'));
        controller.enqueue(encoder.encode("trop-long"));
        controller.enqueue(encoder.encode('"}'));
        controller.close();
      }
    });
    const request = new Request("https://social.example.test/api", {
      method: "POST",
      body: stream,
      duplex: "half"
    } as RequestInit & { duplex: "half" });

    await expect(readJsonWithLimit(request, 12)).resolves.toBeUndefined();
  });

  it("compte les octets UTF-8 et refuse un Content-Length déclaré trop grand", async () => {
    const request = new Request("https://social.example.test/api", {
      method: "POST",
      headers: { "content-length": "1000" },
      body: '{"é":1}'
    });

    await expect(readJsonWithLimit(request, 20)).resolves.toBeUndefined();
  });
});
