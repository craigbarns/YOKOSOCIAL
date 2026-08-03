import { describe, expect, it } from "vitest";

import {
  boutiquesResponseSchema,
  familiesResponseSchema,
  familyDetailResponseSchema
} from "./schemas.js";

describe("schémas des APIs YokoSushi", () => {
  it("rejette une réponse boutiques sans tableau model", () => {
    expect(boutiquesResponseSchema.safeParse({ data: [] }).success).toBe(false);
  });

  it("rejette une catégorie sans identifiant", () => {
    expect(familiesResponseSchema.safeParse({ model: [{ lib_famille: "Sushis" }] }).success).toBe(
      false
    );
  });

  it("normalise les prix numériques sous forme de chaîne", () => {
    const result = familyDetailResponseSchema.parse({
      model: {
        id: 10,
        lib_famille: "Sushis",
        produits: [
          {
            id: 94,
            famille_id: 10,
            designation: "Sushi saumon",
            prix: "2.10"
          }
        ]
      }
    });

    expect(result.model.produits[0]?.prix).toBe(2.1);
  });

  it("rejette un prix arbitraire non numérique", () => {
    const result = familyDetailResponseSchema.safeParse({
      model: {
        id: 10,
        lib_famille: "Sushis",
        produits: [
          {
            id: 94,
            famille_id: 10,
            designation: "Sushi saumon",
            prix: "gratuit peut-être"
          }
        ]
      }
    });
    expect(result.success).toBe(false);
  });
});
