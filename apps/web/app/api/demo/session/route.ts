import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isServerDemoMode } from "@/lib/demo-mode";
import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import { requireTrustedMutationOrigin } from "@/lib/authorization";

const inputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().transform((value) => value.toLocaleLowerCase("fr"))
});

const cookieName = "yokosocial-demo-session";

export async function POST(request: Request) {
  if (!isServerDemoMode()) {
    return NextResponse.json({ error: "Mode démonstration désactivé." }, { status: 404 });
  }
  try {
    requireTrustedMutationOrigin(request);
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
  const parsed = inputSchema.safeParse(await readJsonWithLimit(request, 8 * 1024));
  if (!parsed.success) {
    return NextResponse.json({ error: "Informations de connexion invalides." }, { status: 400 });
  }
  const cookieStore = await cookies();
  cookieStore.set(cookieName, randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return NextResponse.json({ ok: true, user: parsed.data });
}

export async function DELETE(request: Request) {
  try {
    requireTrustedMutationOrigin(request);
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
  return NextResponse.json({ ok: true });
}
