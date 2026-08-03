import { expect, test } from "@playwright/test";

test("compte → import → génération → validation → programmation mock", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Nom complet").fill("Responsable test");
  await page.getByLabel("Adresse e-mail").fill("test@yokosocial.local");
  await page.getByLabel("Mot de passe").fill("mot-de-passe-demo");
  await page.getByRole("button", { name: "Créer mon espace" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Nom de l’organisation").fill("YokoSushi E2E");
  await page.getByRole("button", { name: /Continuer vers l’import/ }).click();

  await expect(page).toHaveURL(/\/import/);
  await page.getByRole("button", { name: /Lancer l’analyse/ }).click();
  await expect(page.getByText("Aperçu prêt à vérifier")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Confirmer l’import" }).click();
  await page.getByRole("link", { name: /Générer les publications/ }).click();

  await page.getByRole("button", { name: "Générer 5 publications" }).click();
  await expect(page.getByText("Proposition 5", { exact: false })).toBeVisible();

  const instagramCaption = page.getByLabel("Légende Instagram");
  await instagramCaption.fill("Texte Instagram modifié pour le test E2E. 🍣");
  await page.getByRole("button", { name: "Envoyer en validation" }).click();
  await page.getByRole("button", { name: "Approuver" }).click();
  await page.getByRole("button", { name: /Programmer avec Postiz mock/ }).click();

  await expect(page.getByText("Suivi Postiz actif")).toBeVisible();
  await page.getByRole("link", { name: "Calendrier" }).click();
  await expect(page.getByText("Programmées 1")).toBeVisible();
});
