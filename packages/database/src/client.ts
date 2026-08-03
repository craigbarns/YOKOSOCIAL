import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client";

type DatabaseGlobal = typeof globalThis & {
  __yokosocialDatabaseClient?: PrismaClient;
};

const databaseGlobal = globalThis as DatabaseGlobal;

function requireConnectionString(connectionString?: string): string {
  const value = connectionString ?? process.env.DATABASE_URL;

  if (!value) {
    throw new Error(
      "DATABASE_URL est requis pour accéder à PostgreSQL. Utilisez l’URL Supavisor en mode session sur Railway."
    );
  }

  return value;
}

/**
 * Builds an isolated Prisma client. Prefer {@link getDatabaseClient} in the app;
 * this factory is useful for workers, scripts and integration tests.
 */
export function createDatabaseClient(connectionString?: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: requireConnectionString(connectionString)
  });

  return new PrismaClient({ adapter });
}

/**
 * Lazily creates one client per process. Laziness keeps static builds and the
 * dependency-free demo UI importable before DATABASE_URL is configured.
 */
export function getDatabaseClient(): PrismaClient {
  if (databaseGlobal.__yokosocialDatabaseClient) {
    return databaseGlobal.__yokosocialDatabaseClient;
  }

  const client = createDatabaseClient();
  // One Prisma/pg pool per long-lived Railway process. Creating a client on
  // every property access would exhaust Supabase connections in production.
  databaseGlobal.__yokosocialDatabaseClient = client;

  return client;
}

function lazyClient(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, property): unknown {
      const client = getDatabaseClient();
      const value = Reflect.get(client, property, client) as unknown;

      return typeof value === "function" ? value.bind(client) : value;
    }
  });
}

/** Lazy process-safe client alias used by web routes and workers. */
export const db = lazyClient();
export const prisma = db;

export async function disconnectDatabase(): Promise<void> {
  const client = databaseGlobal.__yokosocialDatabaseClient;

  if (!client) return;

  await client.$disconnect();
  delete databaseGlobal.__yokosocialDatabaseClient;
}
