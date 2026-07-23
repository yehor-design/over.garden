import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { createPublicImageDerivative } from "./derivatives";

describe("createPublicImageDerivative", () => {
  it("re-encodes to webp without carrying image metadata", async () => {
    const input = await sharp({
      create: {
        width: 128,
        height: 96,
        channels: 3,
        background: { r: 120, g: 80, b: 40 },
      },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();

    const derivative = await createPublicImageDerivative(input);
    const metadata = await sharp(derivative.buffer).metadata();

    expect(derivative.contentType).toBe("image/webp");
    expect(derivative.extension).toBe("webp");
    expect(derivative.width).toBe(128);
    expect(derivative.height).toBe(96);
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(metadata.width).toBeLessThanOrEqual(1600);
    expect(metadata.height).toBeLessThanOrEqual(1600);
  });
});
