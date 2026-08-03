export const ACTIVE_WORKSPACE_STORAGE_KEY = "yokosocial-active-workspace-v1";

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "EDITOR", "REVIEWER", "VIEWER"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export type ActiveWorkspace = {
  organizationId: string;
  organizationName: string;
  brandId: string;
  brandName: string;
  websiteUrl: string;
  role: WorkspaceRole;
};

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && WORKSPACE_ROLES.includes(value as WorkspaceRole);
}

export function workspaceRoleAllows(
  role: WorkspaceRole | undefined,
  allowedRoles: readonly WorkspaceRole[]
): boolean {
  return Boolean(role && allowedRoles.includes(role));
}

export function readActiveWorkspace(): ActiveWorkspace | undefined {
  if (typeof window === "undefined") return undefined;
  const stored = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  if (!stored) return undefined;

  try {
    const value = JSON.parse(stored) as Partial<ActiveWorkspace>;
    if (
      !value.organizationId ||
      !value.organizationName ||
      !value.brandId ||
      !value.brandName ||
      !value.websiteUrl ||
      !isWorkspaceRole(value.role)
    ) {
      return undefined;
    }
    return value as ActiveWorkspace;
  } catch {
    window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    return undefined;
  }
}

export function saveActiveWorkspace(workspace: ActiveWorkspace): void {
  window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}
