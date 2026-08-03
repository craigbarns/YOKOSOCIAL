import { defineConfig } from "prisma/config";

import { loadDatabaseEnvironment } from "./scripts/load-environment";

loadDatabaseEnvironment();

// Prisma charge sa configuration avant `generate`, même si aucune connexion
// n'est effectuée. Le fallback local permet donc un clone/build sans secrets.
// Les commandes qui touchent réellement PostgreSQL exécutent d'abord le garde
// scripts/require-database-url.ts et refusent ce fallback.
const migrationUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://localhost:5432/yokosocial?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    // Supabase: préférer DIRECT_URL (connexion directe ou pooler en mode session)
    // pour les migrations. DATABASE_URL reste l'URL poolée utilisée à l'exécution.
    url: migrationUrl
  }
});
