import { z } from "zod";
import { Buffer } from "node:buffer";

const booleanFromString = z.enum(["true", "false"]).transform((value) => value === "true");

const optionalSecret = z
  .string()
  .min(1)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    DEMO_MODE: booleanFromString.optional(),
    DATABASE_URL: optionalSecret,
    DIRECT_URL: optionalSecret,
    AUTH_SECRET: optionalSecret,
    BETTER_AUTH_SECRET: optionalSecret,
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    OPENAI_API_KEY: optionalSecret,
    OPENAI_MODEL: z.string().min(1).default("gpt-5.6-terra"),
    AI_MODE: z.enum(["mock", "real"]).default("mock"),
    POSTIZ_BASE_URL: z.url().default("https://api.postiz.com/public/v1"),
    POSTIZ_API_KEY: optionalSecret,
    POSTIZ_MODE: z.enum(["mock", "real"]).default("mock"),
    POSTIZ_ORGANIZATION_ID: optionalSecret,
    POSTIZ_GROUP_ID: optionalSecret,
    STORAGE_MODE: z.enum(["local", "s3"]).default("local"),
    S3_ENDPOINT: optionalSecret,
    S3_REGION: z.string().default("eu-west-3"),
    S3_BUCKET: optionalSecret,
    S3_ACCESS_KEY: optionalSecret,
    S3_SECRET_KEY: optionalSecret,
    S3_PUBLIC_URL: optionalSecret,
    YOKOSUSHI_WEBSITE_URL: z.url().default("https://www.yokosushi.fr"),
    WEBSITE_IMPORT_MODE: z.enum(["mock", "real"]).default("real"),
    PLAYWRIGHT_ENABLED: booleanFromString.default(true),
    CRAWLER_MAX_PAGES: z.coerce.number().int().min(1).max(500).default(80),
    CRAWLER_CONCURRENCY: z.coerce.number().int().min(1).max(5).default(2),
    CRAWLER_DELAY_MS: z.coerce.number().int().min(100).max(30_000).default(750),
    CRAWLER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
    CRAWLER_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(3),
    REDIS_URL: optionalSecret,
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
    ENCRYPTION_KEY: optionalSecret,
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
  })
  .superRefine((env, context) => {
    if (env.DEMO_MODE ?? env.NODE_ENV !== "production") return;

    for (const field of ["DATABASE_URL", "ENCRYPTION_KEY"] as const) {
      if (!env[field]) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} est requis hors démo.`
        });
      }
    }
    if (!env.AUTH_SECRET && !env.BETTER_AUTH_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "AUTH_SECRET ou BETTER_AUTH_SECRET est requis hors démo."
      });
    }
    const authSecret = env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET;
    if (authSecret && authSecret.length < 32) {
      context.addIssue({
        code: "custom",
        path: [env.BETTER_AUTH_SECRET ? "BETTER_AUTH_SECRET" : "AUTH_SECRET"],
        message: "Le secret d’authentification doit contenir au moins 32 caractères."
      });
    }
    if (env.ENCRYPTION_KEY) {
      const decoded = Buffer.from(env.ENCRYPTION_KEY, "base64");
      if (decoded.byteLength !== 32 || decoded.toString("base64") !== env.ENCRYPTION_KEY) {
        context.addIssue({
          code: "custom",
          path: ["ENCRYPTION_KEY"],
          message: "ENCRYPTION_KEY doit contenir exactement 32 octets encodés en base64."
        });
      }
    }
    if (env.AI_MODE === "real" && !env.OPENAI_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY est requise en mode IA réel."
      });
    }
    if (env.POSTIZ_MODE === "real" && !env.POSTIZ_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["POSTIZ_API_KEY"],
        message: "POSTIZ_API_KEY est requise en mode Postiz réel."
      });
    }
    if (env.POSTIZ_MODE === "real" && !env.POSTIZ_ORGANIZATION_ID) {
      context.addIssue({
        code: "custom",
        path: ["POSTIZ_ORGANIZATION_ID"],
        message: "POSTIZ_ORGANIZATION_ID lie la clé Postiz à une seule organisation."
      });
    }
    if (env.POSTIZ_MODE === "real" && env.STORAGE_MODE !== "s3") {
      context.addIssue({
        code: "custom",
        path: ["STORAGE_MODE"],
        message: "Le mode Postiz réel exige le stockage S3."
      });
    }
    if (env.POSTIZ_MODE === "real" && !env.S3_PUBLIC_URL) {
      context.addIssue({
        code: "custom",
        path: ["S3_PUBLIC_URL"],
        message: "S3_PUBLIC_URL est requis pour charger les médias à publier."
      });
    }
    if (env.STORAGE_MODE === "s3") {
      for (const field of ["S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"] as const) {
        if (!env[field]) {
          context.addIssue({ code: "custom", path: [field], message: `${field} est requis.` });
        }
      }
    }
  })
  .transform((env) => ({
    ...env,
    DEMO_MODE: env.DEMO_MODE ?? env.NODE_ENV !== "production"
  }));

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(source);
}

const secretKeyPattern = /(authorization|api[-_]?key|token|secret|password|cookie)/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        secretKeyPattern.test(key) ? "[REDACTED]" : redactSecrets(child)
      ])
    );
  }
  return value;
}
