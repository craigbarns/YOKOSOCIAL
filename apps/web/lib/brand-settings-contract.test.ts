import { describe, expect, it } from "vitest";

import {
  brandProfilePatchSchema,
  brandProfileQuerySchema,
  establishmentPatchSchema
} from "./brand-settings-contract";

const establishmentTarget = {
  organizationId: "org_1",
  brandId: "brand_1",
  establishmentId: "est_1"
};

const brandTarget = {
  organizationId: "org_1",
  brandId: "brand_1"
};

describe("contrats des réglages de marque", () => {
  it("exige le tenant et la marque pour lire un profil", () => {
    expect(brandProfileQuerySchema.safeParse(brandTarget).success).toBe(true);
    expect(brandProfileQuerySchema.safeParse({ brandId: "brand_1" }).success).toBe(false);
  });

  it("refuse une modification critique d’établissement non confirmée", () => {
    for (const change of [
      { addressLine1: "10 rue Exemple" },
      { phone: "+33 1 23 45 67 89" },
      { businessHours: { monday: ["12:00", "22:00"] } }
    ]) {
      expect(
        establishmentPatchSchema.safeParse({ ...establishmentTarget, ...change }).success
      ).toBe(false);
    }
  });

  it("accepte les informations locales uniquement avec confirmation explicite", () => {
    const parsed = establishmentPatchSchema.safeParse({
      ...establishmentTarget,
      addressLine1: "10 rue Exemple",
      postalCode: "75001",
      city: "Paris",
      countryCode: "fr",
      phone: "+33 1 23 45 67 89",
      businessHours: { monday: { open: "12:00", close: "22:00" } },
      criticalFieldsConfirmed: true
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.countryCode).toBe("FR");
  });

  it("autorise une correction non critique sans fausse validation locale", () => {
    expect(
      establishmentPatchSchema.safeParse({
        ...establishmentTarget,
        services: ["Livraison", "À emporter"],
        orderUrl: "https://www.yokosushi.fr/commande"
      }).success
    ).toBe(true);
  });

  it("exige la confirmation critique pour approuver un établissement", () => {
    expect(
      establishmentPatchSchema.safeParse({
        ...establishmentTarget,
        reviewDecision: "APPROVED"
      }).success
    ).toBe(false);
    expect(
      establishmentPatchSchema.safeParse({
        ...establishmentTarget,
        reviewDecision: "APPROVED",
        criticalFieldsConfirmed: true
      }).success
    ).toBe(true);
  });

  it("accepte un rejet seul et refuse une confirmation sans décision", () => {
    expect(
      establishmentPatchSchema.safeParse({
        ...establishmentTarget,
        reviewDecision: "REJECTED"
      }).success
    ).toBe(true);
    expect(
      establishmentPatchSchema.safeParse({
        ...establishmentTarget,
        criticalFieldsConfirmed: true
      }).success
    ).toBe(false);
  });

  it("refuse les liens dangereux, les doublons et les corrections vides", () => {
    expect(
      establishmentPatchSchema.safeParse({
        ...establishmentTarget,
        orderUrl: "javascript:alert(1)"
      }).success
    ).toBe(false);
    expect(
      establishmentPatchSchema.safeParse({
        ...establishmentTarget,
        services: ["Livraison", "Livraison"]
      }).success
    ).toBe(false);
    expect(establishmentPatchSchema.safeParse(establishmentTarget).success).toBe(false);
  });

  it("valide un profil de marque complet et structuré", () => {
    expect(
      brandProfilePatchSchema.safeParse({
        ...brandTarget,
        slogan: "Préparé avec soin",
        tones: ["GOURMAND", "MODERN", "WARM"],
        colors: { primary: "#8B1E2D" },
        allowedExpressions: ["fraîcheur", "générosité"],
        wordsToAvoid: ["explosion de saveurs"],
        allowedEmojis: ["🍣", "🥢"],
        emojiUsageLevel: 2,
        languages: ["fr", "en"],
        orderLinks: { website: "https://www.yokosushi.fr/commande" },
        socialPlatforms: ["INSTAGRAM", "FACEBOOK"],
        customInstruction: "Ne jamais inventer un prix ou une promotion."
      }).success
    ).toBe(true);
  });

  it("refuse les valeurs de profil ambiguës ou dupliquées", () => {
    expect(brandProfilePatchSchema.safeParse(brandTarget).success).toBe(false);
    expect(
      brandProfilePatchSchema.safeParse({ ...brandTarget, tones: ["MODERN", "MODERN"] }).success
    ).toBe(false);
    expect(
      brandProfilePatchSchema.safeParse({ ...brandTarget, languages: ["fr", "fr"] }).success
    ).toBe(false);
    expect(
      brandProfilePatchSchema.safeParse({
        ...brandTarget,
        orderLinks: { website: "file:///etc/passwd" }
      }).success
    ).toBe(false);
  });
});
