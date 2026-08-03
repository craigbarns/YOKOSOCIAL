import type { NextConfig } from "next";
import { resolve } from "node:path";

const monorepoRoot = resolve(import.meta.dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root: monorepoRoot
  },
  transpilePackages: [
    "@yokosocial/ai",
    "@yokosocial/config",
    "@yokosocial/database",
    "@yokosocial/postiz",
    "@yokosocial/shared",
    "@yokosocial/ui",
    "@yokosocial/website-importer"
  ],
  serverExternalPackages: ["@prisma/client", "better-auth"]
};

export default nextConfig;
