import { describe, expect, it } from "vitest";

import { redactPostizSecrets } from "./redaction.js";

describe("redactPostizSecrets", () => {
  it("masque les en-têtes, tokens OAuth et clés connues, y compris dans les messages", () => {
    const apiKey = "private-api-key-value";
    const redacted = redactPostizSecrets(
      {
        Authorization: apiKey,
        nested: {
          accessToken: "pos_abc123",
          message: `Authorization: ${apiKey}; Bearer abc.def.ghi; pos_other-token`
        }
      },
      [apiKey]
    );
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain("pos_abc123");
    expect(serialized).not.toContain("abc.def.ghi");
    expect(serialized).toContain("[REDACTED]");
  });
});
