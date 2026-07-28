import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
  classifyLaunchMediaDerivative,
} from "./launch-media-quality";

describe("launch media quality policy", () => {
  it("rejects tiny, fully transparent, flat, and two-tone placeholder derivatives", async () => {
    const fixtures = [
      {
        name: "tiny",
        buffer: await solid({ red: 80, green: 140, blue: 70, alpha: 1 }),
        width: 32,
        height: 32,
      },
      {
        name: "transparent",
        buffer: await solid({ red: 0, green: 0, blue: 0, alpha: 0 }),
        width: 800,
        height: 600,
      },
      {
        name: "flat-black",
        buffer: await solid({ red: 0, green: 0, blue: 0, alpha: 1 }),
        width: 800,
        height: 600,
      },
      {
        name: "flat-white",
        buffer: await solid({ red: 255, green: 255, blue: 255, alpha: 1 }),
        width: 800,
        height: 600,
      },
      {
        name: "checker-placeholder",
        buffer: await checker(),
        width: 800,
        height: 600,
      },
    ];

    for (const fixture of fixtures) {
      const classified = await classifyLaunchMediaDerivative(fixture);
      expect(classified.policyVersion, fixture.name).toBe(
        LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
      );
      expect(
        classified.qualityClass,
        `${fixture.name}: ${JSON.stringify(classified)}`,
      ).not.toBe("accepted");
    }
  });

  it("passes normal and legitimate low-key photos while reviewing ambiguous darkness", async () => {
    const normal = await gradient({ low: 25, high: 220 });
    const lowKey = await gradient({ low: 3, high: 70 });
    const ambiguous = await gradient({ low: 2, high: 18 });

    await expectClass(normal, "accepted");
    await expectClass(lowKey, "accepted");
    await expectClass(ambiguous, "review_required");
  });

  it("is deterministic, bounded, and abortable", async () => {
    const buffer = await gradient({ low: 10, high: 190 });
    const startedAt = performance.now();
    const first = await classifyLaunchMediaDerivative({
      buffer,
      width: 800,
      height: 600,
    });
    const second = await classifyLaunchMediaDerivative({
      buffer,
      width: 800,
      height: 600,
    });

    expect(second).toEqual(first);
    expect(performance.now() - startedAt).toBeLessThan(500);

    const controller = new AbortController();
    controller.abort(new Error("derivative analysis timeout"));
    await expect(
      classifyLaunchMediaDerivative({
        buffer,
        width: 800,
        height: 600,
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow("derivative analysis timeout");
  });
});

async function expectClass(
  buffer: Buffer,
  qualityClass: "accepted" | "review_required",
) {
  const result = await classifyLaunchMediaDerivative({
    buffer,
    width: 800,
    height: 600,
  });
  expect(result.qualityClass, JSON.stringify(result)).toBe(qualityClass);
}

async function solid(background: {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}) {
  const pixel = Buffer.from([
    background.red,
    background.green,
    background.blue,
    Math.round(background.alpha * 255),
  ]);
  const data = Buffer.alloc(800 * 600 * 4);
  for (let offset = 0; offset < data.length; offset += 4)
    pixel.copy(data, offset);
  return sharp(data, { raw: { width: 800, height: 600, channels: 4 } })
    .webp({ lossless: true })
    .toBuffer();
}

async function gradient(input: { low: number; high: number }) {
  const width = 800;
  const height = 600;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const wave =
        0.62 * (x / (width - 1)) +
        0.28 * (y / (height - 1)) +
        0.1 * (((Math.floor(x / 37) + Math.floor(y / 29)) % 5) / 4);
      const value = Math.round(input.low + (input.high - input.low) * wave);
      data[offset] = value;
      data[offset + 1] = Math.min(255, Math.round(value * 0.92 + (x % 23)));
      data[offset + 2] = Math.min(255, Math.round(value * 0.78 + (y % 29)));
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .webp({ quality: 90 })
    .toBuffer();
}

async function checker() {
  const width = 800;
  const height = 600;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (Math.floor(x / 40) + Math.floor(y / 40)) % 2 ? 240 : 16;
      const offset = (y * width + x) * 3;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .webp({ lossless: true })
    .toBuffer();
}
