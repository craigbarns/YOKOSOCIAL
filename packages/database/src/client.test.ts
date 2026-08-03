import { afterEach, describe, expect, it } from "vitest";

import { disconnectDatabase, getDatabaseClient } from "./client";

const previousDatabaseUrl = process.env.DATABASE_URL;

afterEach(async () => {
  await disconnectDatabase();
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

describe("database client lifecycle", () => {
  it("réutilise un seul pool Prisma par processus, y compris en production", () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/yokosocial_test";

    const first = getDatabaseClient();
    const second = getDatabaseClient();

    expect(second).toBe(first);
  });
});
