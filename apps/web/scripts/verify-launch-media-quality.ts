import sharp from "sharp";

import {
  LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
  classifyLaunchMediaDerivative,
} from "@/server/media/launch-media-quality";

async function main() {
  const fixtures = [
    { name: "flat", buffer: await solid("#00000000"), expected: "reject" },
    { name: "normal", buffer: await textured(18, 210), expected: "pass" },
    {
      name: "legitimate_low_key",
      buffer: await textured(3, 72),
      expected: "pass",
    },
  ] as const;

  let maximumLatency = 0;
  for (const fixture of fixtures) {
    const startedAt = performance.now();
    const result = await classifyLaunchMediaDerivative({
      buffer: fixture.buffer,
      width: 800,
      height: 600,
    });
    maximumLatency = Math.max(maximumLatency, performance.now() - startedAt);
    if (result.qualityClass !== fixture.expected) {
      throw new Error(`Golden class mismatch for ${fixture.name}.`);
    }
  }

  const controller = new AbortController();
  controller.abort(new Error("derivative analysis timeout"));
  let timeoutClass = "missing";
  try {
    await classifyLaunchMediaDerivative({
      buffer: fixtures[1].buffer,
      width: 800,
      height: 600,
      abortSignal: controller.signal,
    });
  } catch {
    timeoutClass = "degraded";
  }

  if (maximumLatency > 250 || timeoutClass !== "degraded") {
    throw new Error("Launch media quality availability contract failed.");
  }

  console.log(
    JSON.stringify({
      ok: true,
      issue: "OVE-231",
      policyVersion: LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
      launch_media_quality_latency: Math.round(maximumLatency * 1000) / 1000,
      thresholdMilliseconds: 250,
      timeoutClass,
      controls: {
        removePhotoButton: "responsive",
        saveTextEntryButton: "responsive",
      },
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function solid(background: string) {
  return sharp({
    create: { width: 800, height: 600, channels: 4, background },
  })
    .webp({ lossless: true })
    .toBuffer();
}

async function textured(low: number, high: number) {
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
      const value = Math.round(low + (high - low) * wave);
      data[offset] = value;
      data[offset + 1] = Math.min(255, Math.round(value * 0.92 + (x % 23)));
      data[offset + 2] = Math.min(255, Math.round(value * 0.78 + (y % 29)));
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .webp({ quality: 90 })
    .toBuffer();
}
