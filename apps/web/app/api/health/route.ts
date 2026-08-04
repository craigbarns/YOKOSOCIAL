import { db } from "@yokosocial/database";
import { NextResponse } from "next/server";

import { isPublicDemoMode, isServerDemoMode } from "@/lib/demo-mode";

export async function GET() {
  const startTime = Date.now();
  let dbStatus = "ok";
  let dbLatencyMs = 0;

  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
  } catch (error) {
    dbStatus = "error";
    console.error("[health] DB query failed:", error);
  }

  const isHealthy = dbStatus === "ok";
  const openAiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const postizMode = process.env.POSTIZ_MODE || "mock";

  return NextResponse.json(
    {
      status: isHealthy ? "ok" : "degraded",
      service: "yokosocial-web",
      demoMode: isServerDemoMode() && isPublicDemoMode(),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      checks: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs
        },
        openai: {
          configured: openAiConfigured,
          model: process.env.OPENAI_MODEL || "gpt-4o-mini"
        },
        postiz: {
          mode: postizMode
        }
      },
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        }
      }
    },
    {
      status: isHealthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    }
  );
}
