import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { classifyByContext, inspectImage } from "./inspection.js";

describe("inspection média", () => {
  it("contrôle le MIME réel et score une image", async () => {
    const image = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: "#d43c50" }
    })
      .png()
      .toBuffer();
    const result = await inspectImage(image);
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(1200);
    expect(result.qualityScore).toBeGreaterThan(50);
  });

  it("classe d’abord depuis le contexte", () => {
    expect(classifyByContext({ filename: "123.png", productCategory: "California" })).toBe(
      "california"
    );
  });
});
