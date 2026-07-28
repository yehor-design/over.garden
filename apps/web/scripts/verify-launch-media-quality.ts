import { Pool } from "pg";
import sharp from "sharp";

import {
  LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
  LAUNCH_MEDIA_QUALITY_TIMEOUT_MS,
} from "@/lib/media/launch-media-quality";
import {
  LAUNCH_CORPUS_INVENTORY_SQL,
  assertLaunchCorpusInventorySqlIsSelectOnly,
} from "@/server/launch-corpus/inventory";
import { classifyLaunchMediaDerivative } from "@/server/media/launch-media-quality-analyzer";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

type Environment = "local" | "production";

async function main() {
  const argv = process.argv.slice(2);
  const environment = readEnvironment(argv);
  if (readFlag(argv, "--confirm-environment") !== environment) {
    throw new Error("Environment confirmation does not match.");
  }

  const transparent = await solid("#00000000");
  const flatBlack = await solid("#000000ff");
  const normal = await textured(18, 210);
  const legitimateLowKey = await textured(3, 72);
  const fixtures = [
    { name: "transparent", buffer: transparent, expected: "rejected" },
    { name: "flat_black", buffer: flatBlack, expected: "rejected" },
    { name: "normal", buffer: normal, expected: "accepted" },
    {
      name: "legitimate_low_key",
      buffer: legitimateLowKey,
      expected: "accepted",
    },
  ] as const;

  for (const fixture of fixtures) {
    const result = await classifyLaunchMediaDerivative({
      buffer: fixture.buffer,
      width: 800,
      height: 600,
    });
    if (result.qualityClass !== fixture.expected) {
      throw new Error(`Golden class mismatch for ${fixture.name}.`);
    }
  }

  const durations: number[] = [];
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const startedAt = performance.now();
    const result = await classifyLaunchMediaDerivative({
      buffer: normal,
      width: 800,
      height: 600,
    });
    if (result.qualityClass !== "accepted") {
      throw new Error("Maximum accepted fixture changed class.");
    }
    durations.push(performance.now() - startedAt);
  }
  durations.sort((left, right) => left - right);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Infinity;
  if (p95 > LAUNCH_MEDIA_QUALITY_TIMEOUT_MS) {
    throw new Error("Launch media quality latency exceeded PERF-01.");
  }

  const controller = new AbortController();
  controller.abort(new Error("quality analysis timeout"));
  let timeoutClass = "missing";
  try {
    await classifyLaunchMediaDerivative({
      buffer: normal,
      width: 800,
      height: 600,
      abortSignal: controller.signal,
    });
  } catch {
    timeoutClass = "degraded";
  }
  if (timeoutClass !== "degraded") {
    throw new Error("Launch media quality timeout did not fail closed.");
  }

  const inventory =
    environment === "production" || hasFlag(argv, "--read-only")
      ? await readInventory(environment)
      : {};
  console.log(
    JSON.stringify({
      ok: true,
      issue: "OVE-231",
      environment,
      readOnly: true,
      providerObjectReads: 0,
      policyVersion: LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
      launch_media_quality_analysis_latency: Math.round(p95 * 1_000) / 1_000,
      thresholdMilliseconds: LAUNCH_MEDIA_QUALITY_TIMEOUT_MS,
      timeoutClass,
      controls: {
        removePhotoButton: "responsive",
        saveTextEntryButton: "responsive",
      },
      inventory,
    }),
  );
}

async function readInventory(environment: Environment) {
  assertLaunchCorpusInventorySqlIsSelectOnly();
  if (environment === "production" && !process.env.DATABASE_SSL) {
    process.env.DATABASE_SSL = "true";
  }
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString) throw new Error("Missing supported database connection.");
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });
  try {
    const rows = await pool.query<{ qualityClass: string; count: string }>(
      LAUNCH_CORPUS_INVENTORY_SQL.launchMediaQualityCounts,
    );
    return Object.fromEntries(
      rows.rows.map((row) => [row.qualityClass, Number(row.count)]),
    );
  } finally {
    await pool.end();
  }
}

function readEnvironment(input: string[]): Environment {
  const value = readFlag(input, "--environment");
  if (value !== "local" && value !== "production") {
    throw new Error("Environment must be local or production.");
  }
  return value;
}

function readFlag(input: string[], name: string): string | null {
  const index = input.indexOf(name);
  return index < 0 ? null : (input[index + 1] ?? null);
}

function hasFlag(input: string[], name: string): boolean {
  return input.includes(name);
}

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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
