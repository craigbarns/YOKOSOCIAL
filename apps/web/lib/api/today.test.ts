import { describe, expect, it } from "vitest";

import { todayErrorMessage } from "./today";

describe("todayErrorMessage", () => {
  it("invite à se reconnecter sur une session expirée", () => {
    expect(todayErrorMessage(401)).toBe("Votre session a expiré. Reconnectez-vous.");
  });

  it("explique un accès refusé sans jargon", () => {
    expect(todayErrorMessage(403)).toBe("Vous n’avez pas accès à cet espace.");
  });

  it("oriente vers la création de la marque sur un 404", () => {
    expect(todayErrorMessage(404)).toBe(
      "Votre espace n’est pas encore configuré. Reprenez la création de votre restaurant."
    );
  });

  it("annonce une indisponibilité temporaire sur un 503", () => {
    expect(todayErrorMessage(503)).toBe(
      "Service momentanément indisponible. Réessayez dans un instant."
    );
  });

  it("retombe sur une phrase actionnable pour tout autre code", () => {
    expect(todayErrorMessage(500)).toBe("Impossible de charger votre journée. Réessayez.");
  });
});
