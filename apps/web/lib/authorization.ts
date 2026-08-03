import { db, type OrganizationRole } from "@yokosocial/database";
import { headers } from "next/headers";

import { getAuth, resolveTrustedOrigins, type AuthEnvironment } from "./auth";

export class AuthorizationError extends Error {
  constructor(
    message = "Accès non autorisé.",
    readonly status: 401 | 403 = 403,
    readonly code: "AUTHENTICATION_REQUIRED" | "FORBIDDEN" | "INVALID_ORIGIN" = "FORBIDDEN"
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class AuthenticationError extends AuthorizationError {
  constructor() {
    super("Authentification requise.", 401, "AUTHENTICATION_REQUIRED");
    this.name = "AuthenticationError";
  }
}

export type AuthorizedOrganization = {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
};

async function requestHeaders(provided?: Headers): Promise<Headers> {
  return provided ?? (await headers());
}

export async function requireSession(providedHeaders?: Headers) {
  const session = await getAuth().api.getSession({
    headers: await requestHeaders(providedHeaders)
  });

  if (!session) throw new AuthenticationError();
  return session;
}

export async function requireOrganization(
  organizationId: string,
  allowedRoles?: readonly OrganizationRole[],
  providedHeaders?: Headers
): Promise<AuthorizedOrganization> {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) throw new AuthorizationError();

  const session = await requireSession(providedHeaders);
  const membership = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: normalizedOrganizationId,
        userId: session.user.id
      }
    },
    select: { role: true }
  });

  if (!membership || (allowedRoles && !allowedRoles.includes(membership.role))) {
    throw new AuthorizationError();
  }

  return {
    userId: session.user.id,
    organizationId: normalizedOrganizationId,
    role: membership.role
  };
}

/**
 * Protects cookie-authenticated mutations from cross-origin requests. Browsers
 * send Origin on fetch POST requests; production rejects an absent header.
 */
export function requireTrustedMutationOrigin(
  request: Request,
  environment: AuthEnvironment = process.env
): void {
  const originHeader = request.headers.get("origin");

  if (!originHeader) {
    if (environment.NODE_ENV === "production") {
      throw new AuthorizationError("Origine de la requête refusée.", 403, "INVALID_ORIGIN");
    }
    return;
  }

  let origin: string;
  try {
    origin = new URL(originHeader).origin;
  } catch {
    throw new AuthorizationError("Origine de la requête refusée.", 403, "INVALID_ORIGIN");
  }

  const trustedOrigins = resolveTrustedOrigins(environment);
  if (trustedOrigins.includes(origin)) return;
  // Derrière le proxy Railway, request.url porte l'hôte interne : la
  // comparaison same-origin ne suffit qu'en accès direct (dev local).
  if (origin === new URL(request.url).origin) return;

  throw new AuthorizationError("Origine de la requête refusée.", 403, "INVALID_ORIGIN");
}

export function authorizationErrorBody(error: AuthorizationError): {
  error: string;
  code: string;
} {
  return { error: error.message, code: error.code };
}
