import type { TodayResponse } from "@/lib/today-contract";

export function todayErrorMessage(status: number): string {
  if (status === 401) return "Votre session a expiré. Reconnectez-vous.";
  if (status === 403) return "Vous n’avez pas accès à cet espace.";
  if (status === 404) {
    return "Votre espace n’est pas encore configuré. Reprenez la création de votre restaurant.";
  }
  if (status === 503) return "Service momentanément indisponible. Réessayez dans un instant.";
  return "Impossible de charger votre journée. Réessayez.";
}

export class TodayRequestError extends Error {
  constructor(readonly status: number) {
    super(todayErrorMessage(status));
    this.name = "TodayRequestError";
  }
}

export async function fetchToday(params: {
  organizationId: string;
  brandId: string;
}): Promise<TodayResponse> {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/today?${query}`, {
    cache: "no-store",
    headers: { accept: "application/json" }
  });
  if (!response.ok) throw new TodayRequestError(response.status);
  return (await response.json()) as TodayResponse;
}
