import { NextResponse } from "next/server";

interface RateLimitStore {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitStore>();

// Clean up expired tokens every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (now > record.resetAt) {
      memoryStore.delete(key);
    }
  }
}, 60_000);

export interface RateLimitOptions {
  limit?: number; // max requests
  windowMs?: number; // duration window in ms (default 60s)
}

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = {}
): { allowed: boolean; remaining: number; resetMs: number } {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();

  const record = memoryStore.get(identifier);

  if (!record || now > record.resetAt) {
    memoryStore.set(identifier, {
      count: 1,
      resetAt: now + windowMs
    });
    return { allowed: true, remaining: limit - 1, resetMs: windowMs };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetMs: Math.max(0, record.resetAt - now) };
  }

  record.count += 1;
  return { allowed: true, remaining: limit - record.count, resetMs: Math.max(0, record.resetAt - now) };
}

export function rateLimitResponse(resetMs: number): NextResponse {
  const seconds = Math.ceil(resetMs / 1000);
  return NextResponse.json(
    {
      error: "Trop de requêtes. Veuillez patienter avant de réessayer.",
      retryAfterSeconds: seconds
    },
    {
      status: 429,
      headers: {
        "Retry-After": seconds.toString()
      }
    }
  );
}
