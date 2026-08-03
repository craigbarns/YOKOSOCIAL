import { describe, expect, it } from "vitest";

import { differenceHash, findDuplicates, perceptualDistance, sha256 } from "./hashing.js";

const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#111"/><circle cx="50" cy="50" r="25" fill="#fff"/></svg>'
);

describe("hashes médias", () => {
  it("produit un SHA-256 stable", () => {
    expect(sha256(Buffer.from("yoko"))).toBe(
      "6d67d2faff04e44c31364ed04702cdaa897166c52f0cdd4e5f3f92c105bda8a3"
    );
  });

  it("produit un dHash et calcule sa distance", async () => {
    const hash = await differenceHash(svg);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(perceptualDistance(hash, hash)).toBe(0);
  });

  it("sépare doublons exacts et candidats perceptuels", () => {
    const result = findDuplicates(
      { id: "new", sha256: "exact", perceptualHash: "0000000000000000" },
      [
        { id: "a", sha256: "exact", perceptualHash: "ffffffffffffffff" },
        { id: "b", sha256: "other", perceptualHash: "0000000000000001" }
      ]
    );
    expect(result.exact.map((item) => item.id)).toEqual(["a"]);
    expect(result.similar[0]?.id).toBe("b");
  });
});
