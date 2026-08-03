import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isPublicDemoMode, isServerDemoMode } from "@/lib/demo-mode";

export function proxy(request: NextRequest) {
  const demoMode = isServerDemoMode() && isPublicDemoMode();
  const demoSession = request.cookies.get("yokosocial-demo-session")?.value;
  const productionSession = getSessionCookie(request, { cookiePrefix: "yokosocial" });

  if ((demoMode && demoSession) || productionSession) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/calendar/:path*",
    "/posts/:path*",
    "/media/:path*",
    "/products/:path*",
    "/establishments/:path*",
    "/import/:path*",
    "/social-accounts/:path*",
    "/settings/:path*",
    "/onboarding/:path*"
  ]
};
