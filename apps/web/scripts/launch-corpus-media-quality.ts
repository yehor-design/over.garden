import { Pool } from "pg";

import { MAX_COMPOSER_IMAGE_BYTES } from "@/lib/media/image-limits";
import { getPublicDerivativeObjectBuffer } from "@/lib/storage";
import {
  LAUNCH_CORPUS_INVENTORY_SQL,
  assertLaunchCorpusInventorySqlIsSelectOnly,
} from "@/server/launch-corpus/inventory";
import {
  LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
  classifyLaunchMediaDerivative,
  type LaunchMediaQualityClass,
} from "@/server/media/launch-media-quality";
import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";

type Environment = "local" | "production";

const argv = process.argv.slice(2);
const environment = readEnvironment(argv);
if (readFlag(argv, "--confirm-environment") !== environment) {
  throw new Error("Environment confirmation does not match.");
}
if (readFlag(argv, "--mode") !== "inventory") {
  throw new Error("Only SELECT-only inventory mode is supported.");
}
if (environment === "production" && !process.env.DATABASE_SSL) {
  process.env.DATABASE_SSL = "true";
}

assertLaunchCorpusInventorySqlIsSelectOnly();

async function main() {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  if (!connectionString)
    throw new Error("Missing supported database connection.");

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: resolveDatabaseSslConfig(process.env, resolution),
  });

  try {
    const result = await pool.query<{
      derivativeKey: string;
      width: number | null;
      height: number | null;
    }>(LAUNCH_CORPUS_INVENTORY_SQL.launchMediaQualityCandidates);
    const counts: Record<LaunchMediaQualityClass | "unreadable", number> = {
      pass: 0,
      reject: 0,
      review_required: 0,
      unreadable: 0,
    };

    for (let offset = 0; offset < result.rows.length; offset += 4) {
      await Promise.all(
        result.rows.slice(offset, offset + 4).map(async (row) => {
          try {
            const buffer = await getPublicDerivativeObjectBuffer(
              row.derivativeKey,
              MAX_COMPOSER_IMAGE_BYTES,
            );
            const quality = await classifyLaunchMediaDerivative({
              buffer,
              width: row.width ?? 0,
              height: row.height ?? 0,
            });
            counts[quality.qualityClass] += 1;
          } catch {
            counts.unreadable += 1;
          }
        }),
      );
    }

    console.log(
      JSON.stringify({
        ok: true,
        issue: "OVE-231",
        environment,
        mode: "inventory",
        redacted: true,
        selectOnly: true,
        policyVersion: LAUNCH_MEDIA_QUALITY_POLICY_VERSION,
        candidateCount: result.rows.length,
        counts,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

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
