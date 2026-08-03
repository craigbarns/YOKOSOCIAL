import { MockPostizProvider, RealPostizProvider, type PostizProvider } from "@yokosocial/postiz";

import { AuthorizationError } from "./authorization";

export function assertServerPostizTenantScope(organizationId: string): void {
  if (process.env.POSTIZ_MODE !== "real") return;
  const allowedOrganizationId = process.env.POSTIZ_ORGANIZATION_ID?.trim();
  if (!allowedOrganizationId) {
    throw new Error("La configuration Postiz réelle n’est pas liée à une organisation.");
  }
  if (organizationId !== allowedOrganizationId) throw new AuthorizationError();
}

export function serverPostizGroupId(): string | undefined {
  const value = process.env.POSTIZ_GROUP_ID?.trim();
  return value || undefined;
}

export function createServerPostizProvider(organizationId: string): PostizProvider {
  assertServerPostizTenantScope(organizationId);
  if (process.env.POSTIZ_MODE !== "real") return new MockPostizProvider();

  const apiKey = process.env.POSTIZ_API_KEY?.trim();
  const baseUrl = process.env.POSTIZ_BASE_URL?.trim();
  if (!apiKey || !baseUrl) {
    throw new Error("La configuration Postiz réelle est incomplète.");
  }
  return new RealPostizProvider({ baseUrl, apiKey });
}
