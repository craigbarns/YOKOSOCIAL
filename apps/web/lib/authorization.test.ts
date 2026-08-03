import { describe, expect, it } from "vitest";

import {
  AuthorizationError,
  authorizationErrorBody,
  requireTrustedMutationOrigin
} from "./authorization";
import type { AuthEnvironment } from "./auth";

const productionEnvironment: AuthEnvironment = {
  NODE_ENV: "production",
  APP_URL: "https://social.yokosushi.example"
};

function mutationRequest(origin?: string): Request {
  return new Request("https://social.yokosushi.example/api/organizations", {
    method: "POST",
    ...(origin ? { headers: { origin } } : {})
  });
}

describe("mutation origin authorization", () => {
  it("accepte l’origine de production configurée", () => {
    expect(() =>
      requireTrustedMutationOrigin(
        mutationRequest("https://social.yokosushi.example"),
        productionEnvironment
      )
    ).not.toThrow();
  });

  it("accepte l’origine configurée quand l’URL interne diffère (proxy Railway)", () => {
    const proxiedRequest = new Request("http://localhost:8080/api/organizations", {
      method: "POST",
      headers: { origin: "https://social.yokosushi.example" }
    });
    expect(() =>
      requireTrustedMutationOrigin(proxiedRequest, productionEnvironment)
    ).not.toThrow();
  });

  it("refuse une origine externe", () => {
    expect(() =>
      requireTrustedMutationOrigin(
        mutationRequest("https://attacker.example"),
        productionEnvironment
      )
    ).toThrow(AuthorizationError);
  });

  it("échoue fermé sans en-tête Origin en production", () => {
    expect(() => requireTrustedMutationOrigin(mutationRequest(), productionEnvironment)).toThrow(
      "Origine de la requête refusée"
    );
  });

  it("accepte une requête locale sans Origin en développement", () => {
    expect(() =>
      requireTrustedMutationOrigin(mutationRequest(), {
        NODE_ENV: "development",
        APP_URL: "http://localhost:3000"
      })
    ).not.toThrow();
  });

  it("produit une erreur publique sans détail technique", () => {
    const error = new AuthorizationError("Accès non autorisé.", 403, "FORBIDDEN");
    expect(authorizationErrorBody(error)).toEqual({
      error: "Accès non autorisé.",
      code: "FORBIDDEN"
    });
  });
});
