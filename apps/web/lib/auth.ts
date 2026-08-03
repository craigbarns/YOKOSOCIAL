import { db } from "@yokosocial/database";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

const LOCAL_BASE_URL = "http://localhost:3000";
const MINIMUM_SECRET_LENGTH = 32;

export type AuthEnvironment = Readonly<Record<string, string | undefined>>;

export type AuthRuntimeConfig = Readonly<{
  baseURL: string;
  secret: string;
  trustedOrigins: readonly string[];
}>;

export class AuthConfigurationError extends Error {
  readonly code = "AUTH_CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

function isProduction(environment: AuthEnvironment): boolean {
  return environment.NODE_ENV === "production";
}

function normalizeHTTPOrigin(value: string, variableName: string, production: boolean): string {
  let parsed: URL;

  try {
    parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    throw new AuthConfigurationError(`${variableName} doit être une URL absolue valide.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AuthConfigurationError(`${variableName} doit utiliser HTTP ou HTTPS.`);
  }

  if (production && parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    parsed.protocol = "https:";
  }

  return parsed.origin;
}

function resolveBaseURL(environment: AuthEnvironment): string {
  const production = isProduction(environment);
  const configured = environment.BETTER_AUTH_URL ?? environment.APP_URL;
  const configuredVariableName = environment.BETTER_AUTH_URL ? "BETTER_AUTH_URL" : "APP_URL";
  const vercelURL = environment.VERCEL_URL
    ? `https://${environment.VERCEL_URL.replace(/^https?:\/\//, "")}`
    : undefined;
  const railwayURL = environment.RAILWAY_PUBLIC_DOMAIN ?? environment.RAILWAY_STATIC_URL
    ? `https://${(environment.RAILWAY_PUBLIC_DOMAIN ?? environment.RAILWAY_STATIC_URL)?.replace(/^https?:\/\//, "")}`
    : undefined;
  const candidate = configured ?? vercelURL ?? railwayURL ?? (production ? undefined : LOCAL_BASE_URL);

  if (!candidate) {
    throw new AuthConfigurationError("BETTER_AUTH_URL ou APP_URL est requis en production.");
  }

  return normalizeHTTPOrigin(
    candidate,
    configured ? configuredVariableName : "RAILWAY_PUBLIC_DOMAIN",
    production
  );
}

function validateDatabaseURL(environment: AuthEnvironment): void {
  const value = environment.DATABASE_URL;

  if (!value) {
    throw new AuthConfigurationError(
      "DATABASE_URL est requis pour l’authentification persistante."
    );
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error();
    if (!parsed.hostname) throw new Error();
  } catch {
    throw new AuthConfigurationError("DATABASE_URL doit être une URL PostgreSQL valide.");
  }
}

function resolveSecret(environment: AuthEnvironment): string {
  const secret = environment.BETTER_AUTH_SECRET ?? environment.AUTH_SECRET;

  if (!secret) {
    throw new AuthConfigurationError("BETTER_AUTH_SECRET ou AUTH_SECRET est requis.");
  }

  if (secret.length < MINIMUM_SECRET_LENGTH) {
    throw new AuthConfigurationError(
      `Le secret Better Auth doit contenir au moins ${MINIMUM_SECRET_LENGTH} caractères.`
    );
  }

  return secret;
}

export function resolveTrustedOrigins(
  environment: AuthEnvironment = process.env
): readonly string[] {
  const production = isProduction(environment);
  const origins = new Set<string>([resolveBaseURL(environment)]);
  const configuredOrigins = environment.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? [];

  for (const configuredOrigin of configuredOrigins) {
    const value = configuredOrigin.trim();
    if (!value) continue;
    origins.add(normalizeHTTPOrigin(value, "BETTER_AUTH_TRUSTED_ORIGINS", production));
  }

  return Object.freeze([...origins]);
}

export function resolveAuthRuntimeConfig(
  environment: AuthEnvironment = process.env
): AuthRuntimeConfig {
  validateDatabaseURL(environment);

  return Object.freeze({
    baseURL: resolveBaseURL(environment),
    secret: resolveSecret(environment),
    trustedOrigins: resolveTrustedOrigins(environment)
  });
}

function createAuth() {
  const config = resolveAuthRuntimeConfig();

  return betterAuth({
    appName: "FeedPulse",
    baseURL: config.baseURL,
    secret: config.secret,
    database: prismaAdapter(db, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60 * 10, max: 5 },
        "/request-password-reset": { window: 60 * 10, max: 5 }
      }
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
      cookiePrefix: "yokosocial"
    },
    trustedOrigins: [...config.trustedOrigins],
    telemetry: { enabled: false },
    plugins: [nextCookies()]
  });
}

export type AppAuth = ReturnType<typeof createAuth>;

let authInstance: AppAuth | undefined;

/**
 * Better Auth is created only inside a request path. Importing this module during
 * `next build` therefore neither opens PostgreSQL nor requires production secrets.
 */
export function getAuth(): AppAuth {
  authInstance ??= createAuth();
  return authInstance;
}

export function isAuthConfigurationError(error: unknown): error is AuthConfigurationError {
  return error instanceof AuthConfigurationError;
}
