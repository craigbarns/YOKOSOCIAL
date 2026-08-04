"use client";

import { TodayPage } from "@/components/today/today-page";
import { isPublicDemoMode } from "@/lib/demo-mode";

export default function Page() {
  return <TodayPage demoMode={isPublicDemoMode()} />;
}
