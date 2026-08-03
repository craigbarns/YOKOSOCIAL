import { toNextJsHandler } from "better-auth/next-js";

import { getAuth, isAuthConfigurationError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authHandler(request: Request): Promise<Response> {
  try {
    return await getAuth().handler(request);
  } catch (error) {
    if (!isAuthConfigurationError(error)) throw error;

    console.error("[auth] Configuration d’authentification indisponible.");
    return Response.json(
      { error: "Service d’authentification temporairement indisponible." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
}

const handlers = toNextJsHandler(authHandler);

export const GET = handlers.GET;
export const POST = handlers.POST;
