export class InvalidOrganizationContextError extends Error {
  constructor(message = "Un organizationId valide est requis pour cette opération.") {
    super(message);
    this.name = "InvalidOrganizationContextError";
  }
}

export function assertOrganizationId(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidOrganizationContextError();
  }
}

/**
 * Small, explicit building block for every tenant-scoped Prisma query.
 *
 * @example
 * db.socialPost.findMany({ where: { ...organizationScope(orgId), status } })
 */
export function organizationScope(organizationId: string): Readonly<{ organizationId: string }> {
  assertOrganizationId(organizationId);
  return Object.freeze({ organizationId });
}

export function assertSameOrganization(
  expectedOrganizationId: string,
  actualOrganizationId: string,
  entityName = "entité"
): void {
  assertOrganizationId(expectedOrganizationId);
  assertOrganizationId(actualOrganizationId);

  if (expectedOrganizationId !== actualOrganizationId) {
    throw new InvalidOrganizationContextError(
      `Accès inter-organisation refusé pour ${entityName}.`
    );
  }
}
