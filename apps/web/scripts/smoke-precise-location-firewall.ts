/**
 * OVE-234 — live Postgres proof that the precise-location firewall refuses
 * before any row is written.
 *
 * For every named user-text surface the smoke attempts a real repository
 * write with a synthetic coordinate payload against the configured database
 * and asserts (a) the typed refusal, (b) that the refusal message carries no
 * coordinate text, and (c) that the table row count is unchanged. It then
 * runs the read-only inventory so the same connection proves the benign
 * corpus of existing rows still classifies clean.
 *
 * The smoke never writes a row and never prints scanned text.
 */

import { readFileSync } from "node:fs";
import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import { isPreciseLocationTextError } from "../src/lib/privacy/precise-location-text";
import {
  PRECISE_LOCATION_INVENTORY_SQL,
  PRECISE_LOCATION_SURFACE_KEYS,
  assertPreciseLocationInventorySqlIsSelectOnly,
  buildPreciseLocationInventoryReport,
  classifyPreciseLocationSurface,
  formatPreciseLocationInventoryReport,
  type PreciseLocationInventoryRow,
  type PreciseLocationSurfaceReport,
} from "../src/server/privacy/precise-location-inventory";

const envFile = argValue("--env-file") ?? ".env.local";
loadEnv({ path: envFile, override: false, quiet: true });

const caFile = argValue("--ca-file");
if (caFile) {
  process.env.DATABASE_SSL_CA = readFileSync(caFile, "utf8");
}

assertPreciseLocationInventorySqlIsSelectOnly();

const resolution = resolveDatabaseConnection(process.env);
const connectionString = resolvePgConnectionString(process.env, resolution);
if (!connectionString) {
  throw new Error("Missing supported database connection env (DATABASE_URL)");
}

const pool = new Pool({
  connectionString,
  max: 1,
  ssl: resolveDatabaseSslConfig(process.env, resolution),
});

/** Synthetic, never a real gardener location. */
const COORDINATES = "50.45010,30.52340";

interface SurfaceCase {
  name: string;
  table: string;
  attempt: () => Promise<unknown>;
}

async function rowCount(table: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::bigint as count from ${table}`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function proveRefusal(testCase: SurfaceCase) {
  const before = await rowCount(testCase.table);

  let refusal: unknown;
  try {
    await testCase.attempt();
  } catch (error) {
    refusal = error;
  }

  assert(
    refusal !== undefined,
    `${testCase.name}: coordinate payload was not refused.`,
  );
  assert(
    isPreciseLocationTextError(refusal),
    `${testCase.name}: refusal was not the typed precise-location error.`,
  );
  const message = refusal instanceof Error ? refusal.message : String(refusal);
  assert(
    !message.includes("50.45010") && !message.includes("30.52340"),
    `${testCase.name}: refusal echoed the rejected value.`,
  );

  const after = await rowCount(testCase.table);
  assert(
    before === after,
    `${testCase.name}: ${testCase.table} row count changed (${before} -> ${after}).`,
  );

  process.stdout.write(
    `- ${testCase.name}: refused before write, ${testCase.table} unchanged at ${after} rows\n`,
  );
}

async function main() {
  const { resolveJournalContentForWrite } = await import(
    "../src/server/journal-document-persistence"
  );
  const { legacyBodyToJournalDocumentV1 } = await import(
    "../src/lib/garden/journal-document"
  );
  const {
    normalizeLineagePendingSourceLabel,
    normalizeLineageSourceReferenceLabel,
  } = await import("../src/server/lineage-repository");
  const { normalizeLineageQuestionText } = await import(
    "../src/server/lineage-interactions-repository"
  );

  process.stdout.write("OVE-234 precise-location firewall smoke\n\n");

  const cases: SurfaceCase[] = [
    {
      name: "journal document + derived body",
      table: "journal_entries",
      attempt: async () =>
        resolveJournalContentForWrite({
          contentDocument: legacyBodyToJournalDocumentV1(
            `Ділянка ${COORDINATES}`,
          ),
          requireStructured: false,
        }),
    },
    {
      name: "lineage source label",
      table: "lineage_provenance_edges",
      attempt: async () =>
        normalizeLineageSourceReferenceLabel(`Сусід ${COORDINATES}`),
    },
    {
      name: "lineage pending source label",
      table: "lineage_provenance_edges",
      attempt: async () =>
        normalizeLineagePendingSourceLabel(`Сусід ${COORDINATES}`),
    },
    {
      name: "lineage question",
      table: "lineage_questions",
      attempt: async () =>
        normalizeLineageQuestionText(`Це ваша ділянка ${COORDINATES}?`),
    },
  ];

  for (const testCase of cases) {
    await proveRefusal(testCase);
  }

  // Comments and profiles refuse through result objects rather than throws,
  // so they are proven by their typed outcome plus an unchanged row count.
  const { normalizeOwnerPublicProfileInput } = await import(
    "../src/server/owner-profile-repository"
  );
  const profileBefore = await rowCount("user_public_profiles");
  const profileResult = normalizeOwnerPublicProfileInput({
    avatarMediaAssetId: null,
    displayName: null,
    bio: `Мій сад ${COORDINATES}`,
    languages: [],
    locationVisibility: "hidden",
    coarseRegionCode: null,
    profileVisibility: "public",
    relationshipVisibility: "counts",
  });
  assert(
    !profileResult.ok && profileResult.error === "precise_location",
    "profile bio: coordinate payload was not refused.",
  );
  const profileAfter = await rowCount("user_public_profiles");
  assert(
    profileBefore === profileAfter,
    "profile bio: user_public_profiles row count changed.",
  );
  process.stdout.write(
    `- profile bio: refused before write, user_public_profiles unchanged at ${profileAfter} rows\n`,
  );

  process.stdout.write("\n");

  const surfaces: PreciseLocationSurfaceReport[] = [];
  for (const surface of PRECISE_LOCATION_SURFACE_KEYS) {
    const result = await pool.query<PreciseLocationInventoryRow>(
      PRECISE_LOCATION_INVENTORY_SQL[surface],
    );
    surfaces.push(classifyPreciseLocationSurface(surface, result.rows));
  }
  const report = buildPreciseLocationInventoryReport(surfaces);
  process.stdout.write(formatPreciseLocationInventoryReport(report));

  if (!report.clean) {
    throw new Error(
      "Existing rows carry precise location; a maintainer-approved cleanup plan is required before closeout.",
    );
  }

  process.stdout.write("\nRESULT: precise-location firewall smoke passed\n");
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
