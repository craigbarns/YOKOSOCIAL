import { NextResponse } from "next/server";

import { isAuthConfigurationError } from "./auth";
import { AuthorizationError, authorizationErrorBody } from "./authorization";

export function accessErrorResponse(error: unknown): NextResponse | undefined {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(authorizationErrorBody(error), { status: error.status });
  }
  if (isAuthConfigurationError(error)) {
    return NextResponse.json(
      { error: "Service d’authentification temporairement indisponible." },
      { status: 503 }
    );
  }
  return undefined;
}

export async function readJsonWithLimit(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return undefined;

  if (!request.body || !Number.isSafeInteger(maxBytes) || maxBytes < 1) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(chunk.value);
    }
    if (received === 0) return undefined;
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  } finally {
    reader.releaseLock();
  }
}
