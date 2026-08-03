import { describe, expect, it } from "vitest";

import { parseRobotsTxt } from "./robots.js";

describe("parseRobotsTxt", () => {
  it("applique la règle la plus spécifique et préfère Allow à égalité", () => {
    const robots = parseRobotsTxt(
      [
        "User-agent: *",
        "Disallow: /admin",
        "Disallow: /images/*/private$",
        "Allow: /admin/public"
      ].join("\n"),
      "YokoSushiSocialAgent/0.1"
    );

    expect(robots.isAllowed("https://www.yokosushi.fr/")).toBe(true);
    expect(robots.isAllowed("https://www.yokosushi.fr/admin/products")).toBe(false);
    expect(robots.isAllowed("https://www.yokosushi.fr/admin/public/logo")).toBe(true);
    expect(robots.isAllowed("https://www.yokosushi.fr/images/a/private")).toBe(false);
    expect(robots.isAllowed("https://www.yokosushi.fr/images/a/private/x")).toBe(true);
  });
});
