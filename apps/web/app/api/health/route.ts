import { NextResponse } from "next/server";

import { isPublicDemoMode, isServerDemoMode } from "@/lib/demo-mode";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "yokosocial-web",
    demoMode: isServerDemoMode() && isPublicDemoMode(),
    timestamp: new Date().toISOString()
  });
}
