import { loadDatabaseEnvironment } from "./load-environment";

loadDatabaseEnvironment();

if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
  console.error(
    "DIRECT_URL ou DATABASE_URL doit être défini pour accéder réellement à PostgreSQL."
  );
  process.exitCode = 1;
}
