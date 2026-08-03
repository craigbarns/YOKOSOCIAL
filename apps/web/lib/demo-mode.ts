function defaultsToDemo(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function isServerDemoMode(): boolean {
  return (
    process.env.DEMO_MODE === "true" || (process.env.DEMO_MODE === undefined && defaultsToDemo())
  );
}

export function isPublicDemoMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
    (process.env.NEXT_PUBLIC_DEMO_MODE === undefined && defaultsToDemo())
  );
}
