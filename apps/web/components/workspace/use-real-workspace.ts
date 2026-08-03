"use client";

import { useCallback, useEffect, useState } from "react";

import {
  readActiveWorkspace,
  saveActiveWorkspace,
  type ActiveWorkspace,
  type WorkspaceRole
} from "@/lib/active-workspace";

type OrganizationResponse = {
  organizations: Array<{
    id: string;
    name: string;
    role: WorkspaceRole;
    brands: Array<{ id: string; name: string; websiteUrl: string | null }>;
  }>;
};

function selectWorkspace(payload: OrganizationResponse): ActiveWorkspace | undefined {
  const saved = readActiveWorkspace();
  if (saved) {
    const organization = payload.organizations.find((item) => item.id === saved.organizationId);
    const brand = organization?.brands.find((item) => item.id === saved.brandId);
    if (organization && brand?.websiteUrl) {
      return {
        organizationId: organization.id,
        organizationName: organization.name,
        brandId: brand.id,
        brandName: brand.name,
        websiteUrl: brand.websiteUrl,
        role: organization.role
      };
    }
  }

  for (const organization of payload.organizations) {
    const brand = organization.brands.find((item) => Boolean(item.websiteUrl));
    if (!brand?.websiteUrl) continue;
    return {
      organizationId: organization.id,
      organizationName: organization.name,
      brandId: brand.id,
      brandName: brand.name,
      websiteUrl: brand.websiteUrl,
      role: organization.role
    };
  }
  return undefined;
}

export function useRealWorkspace() {
  const [workspace, setWorkspace] = useState<ActiveWorkspace>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/organizations", {
        cache: "no-store",
        headers: { accept: "application/json" }
      });
      if (response.status === 401) throw new Error("Votre session a expiré. Reconnectez-vous.");
      if (!response.ok) throw new Error("Impossible de charger votre organisation.");

      const nextWorkspace = selectWorkspace((await response.json()) as OrganizationResponse);
      if (!nextWorkspace) {
        throw new Error("Créez d’abord l’organisation YokoSushi et sa marque.");
      }
      saveActiveWorkspace(nextWorkspace);
      setWorkspace(nextWorkspace);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { workspace, loading, error, refresh };
}
