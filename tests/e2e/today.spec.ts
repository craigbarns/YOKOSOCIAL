import { expect, test } from "@playwright/test";

test("Aujourd’hui pose une seule question, qui change avec l’état du compte", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Nom complet").fill("Responsable today");
  await page.getByLabel("Adresse e-mail").fill("today@yokosocial.local");
  await page.getByLabel("Mot de passe").fill("mot-de-passe-demo");
  await page.getByRole("button", { name: "Créer mon espace" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Nom de l’organisation").fill("Chez Marta E2E");
  await page.getByRole("button", { name: /Continuer vers l’import/ }).click();

  await expect(page).toHaveURL(/\/import/);
  await page.getByRole("link", { name: "Aujourd’hui" }).click();
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByRole("heading", { name: "Collons votre site." })).toBeVisible();

  await page.getByRole("link", { name: "Analyser mon site" }).click();
  await page.getByRole("button", { name: /Lancer l’analyse/ }).click();
  await expect(page.getByText("Aperçu prêt à vérifier")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "Aujourd’hui" }).click();
  await expect(page.getByRole("heading", { name: /plats et .* photos vous attendent/ })).toBeVisible();

  await page.getByRole("link", { name: "Import du site" }).click();
  await page.getByRole("button", { name: "Confirmer l’import" }).click();

  await page.getByRole("link", { name: "Aujourd’hui" }).click();
  await expect(page.getByRole("heading", { name: "Rien à faire aujourd’hui." })).toBeVisible();
  await expect(page.getByText("plats validés")).toBeVisible();
});
