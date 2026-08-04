export function isServerDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function isPublicDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}
