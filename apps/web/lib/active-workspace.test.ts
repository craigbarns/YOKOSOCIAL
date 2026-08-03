import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  isWorkspaceRole,
  readActiveWorkspace,
  saveActiveWorkspace,
  workspaceRoleAllows
} from "./active-workspace";

afterEach(() => vi.unstubAllGlobals());

describe("workspace roles", () => {
  it("reconnaît uniquement les rôles persistables", () => {
    expect(isWorkspaceRole("OWNER")).toBe(true);
    expect(isWorkspaceRole("REVIEWER")).toBe(true);
    expect(isWorkspaceRole("UNKNOWN")).toBe(false);
    expect(isWorkspaceRole(undefined)).toBe(false);
  });

  it("reproduit les autorisations de mutation des comptes sociaux", () => {
    const allowed = ["OWNER", "ADMIN"] as const;
    expect(workspaceRoleAllows("OWNER", allowed)).toBe(true);
    expect(workspaceRoleAllows("ADMIN", allowed)).toBe(true);
    expect(workspaceRoleAllows("EDITOR", allowed)).toBe(false);
  });

  it("sépare édition et validation des publications", () => {
    const editors = ["OWNER", "ADMIN", "EDITOR"] as const;
    const reviewers = ["OWNER", "ADMIN", "REVIEWER"] as const;

    expect(workspaceRoleAllows("EDITOR", editors)).toBe(true);
    expect(workspaceRoleAllows("EDITOR", reviewers)).toBe(false);
    expect(workspaceRoleAllows("REVIEWER", editors)).toBe(false);
    expect(workspaceRoleAllows("REVIEWER", reviewers)).toBe(true);
    expect(workspaceRoleAllows("VIEWER", editors)).toBe(false);
    expect(workspaceRoleAllows("VIEWER", reviewers)).toBe(false);
  });

  it("persiste le rôle et invalide un ancien workspace qui n'en contient pas", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)
      }
    });

    saveActiveWorkspace({
      organizationId: "org-1",
      organizationName: "YokoSushi",
      brandId: "brand-1",
      brandName: "YokoSushi",
      websiteUrl: "https://www.yokosushi.fr",
      role: "REVIEWER"
    });
    expect(readActiveWorkspace()?.role).toBe("REVIEWER");

    values.set(
      ACTIVE_WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        organizationId: "org-1",
        organizationName: "YokoSushi",
        brandId: "brand-1",
        brandName: "YokoSushi",
        websiteUrl: "https://www.yokosushi.fr"
      })
    );
    expect(readActiveWorkspace()).toBeUndefined();
  });
});
