import { resolve } from "node:path";

import { config as loadEnvFile } from "dotenv";

const databasePackageDirectory = resolve(import.meta.dirname, "..");

/** Loads an optional package-local file, then the monorepo-level environment. */
export function loadDatabaseEnvironment(): void {
  loadEnvFile({
    path: resolve(databasePackageDirectory, ".env"),
    quiet: true
  });
  loadEnvFile({
    path: resolve(databasePackageDirectory, "../../.env"),
    quiet: true
  });
}
