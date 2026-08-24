import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient } from "pg";

export const APPROVED_EMPTY_PLAN_DIGEST =
  "a0a27f2d75d1a2c327fc5bd07e239d31b568ca2b3a8f5d3cd0f4cef57c594920";

const APPROVED_SCHEMA_DIGEST =
  "01f9a92a4f5843566e1a1d0e54c82bd1dc1b12af6b014280fc7d2a6260092069";
const EXPECTED_DATABASE = {
  hostname:
    "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com",
  port: "25060",
  database: "defaultdb",
} as const;
const PROVIDER_TABLES = [
  "plant_identification_candidates",
  "plant_identification_decisions",
  "plant_identification_requests",
  "plant_identification_submission_slots",
] as const;
const ADVISORY_LOCK_NAME =
  "overgarden:ove351:external-photo-identification-retirement";
const PRODUCTION_CONFIRMATION = "retire-empty-external-photo-identification";

export interface PreservedAggregates {
  plantObjects: number;
  journalEntries: number;
  mediaAssets: number;
  catalogItems: number;
  lineageEdges: number;
  analyticsEvents: number;
  sourceRegistryRows: number;
}

export interface ExternalPhotoIdentificationEvidence {
  version: "ove351.externalPhotoIdentificationRetirement.v1";
  environment: "production";
  databaseIdentity: "digitalocean_overgarden_production";
  schemaDigest: string;
  presentTables: readonly string[];
  requestCount: number;
  candidateCount: number;
  decisionCount: number;
  submissionSlotCount: number;
  occupiedSubmissionSlotCount: number;
  ownerCount: number;
  referencedObjectCount: number;
  selectedCatalogItemCount: number;
  inFlightRequestCount?: number;
  requestStates?: Record<string, number>;
  candidateMappings?: Record<string, number>;
  decisions?: Record<string, number>;
  preserved: PreservedAggregates;
  preservedSetDigests?: Record<keyof PreservedAggregates, string>;
}

export type RetirementClassification =
  | { state: "eligible_empty" }
  | { state: "already_absent" }
  | { state: "blocked_nonzero"; reason: string }
  | { state: "drift"; reason: string };

export type RetirementOperatorArgs =
  | { mode: "plan" | "verify"; envFile?: string }
  | {
      mode: "apply";
      envFile?: string;
      approvedPlanDigest: string;
      confirmProduction: string;
    };

interface ProviderConfigurationReceipt {
  apiKeyPresent: boolean;
  featureFlag: string | null;
}

export function parseExternalPhotoIdentificationRetirementArgs(
  argv: readonly string[],
): RetirementOperatorArgs {
  const mode = valueFor(argv, "--mode");
  if (mode !== "plan" && mode !== "apply" && mode !== "verify") {
    throw new Error("--mode must be plan, apply, or verify");
  }
  const envFile = valueFor(argv, "--env-file");
  if (mode !== "apply") {
    return envFile ? { mode, envFile } : { mode };
  }

  const approvedPlanDigest = valueFor(argv, "--approved-plan-digest");
  if (approvedPlanDigest !== APPROVED_EMPTY_PLAN_DIGEST) {
    throw new Error("apply requires the exact approved plan digest");
  }
  const confirmProduction = valueFor(argv, "--confirm-production");
  if (confirmProduction !== PRODUCTION_CONFIRMATION) {
    throw new Error("apply requires the explicit production confirmation");
  }
  return {
    mode,
    ...(envFile ? { envFile } : {}),
    approvedPlanDigest,
    confirmProduction,
  };
}

export function classifyExternalPhotoIdentificationRetirement(
  evidence: ExternalPhotoIdentificationEvidence,
): RetirementClassification {
  if (
    evidence.environment !== "production" ||
    evidence.databaseIdentity !== "digitalocean_overgarden_production"
  ) {
    return { state: "drift", reason: "production_identity_mismatch" };
  }

  const expectedTables = [...PROVIDER_TABLES].sort();
  const presentTables = [...evidence.presentTables].sort();
  if (presentTables.length === 0) return { state: "already_absent" };
  if (
    presentTables.length !== expectedTables.length ||
    presentTables.some((table, index) => table !== expectedTables[index])
  ) {
    return { state: "drift", reason: "retired_table_set_mismatch" };
  }
  if (evidence.schemaDigest !== APPROVED_SCHEMA_DIGEST) {
    return { state: "drift", reason: "retired_schema_digest_mismatch" };
  }
  if (evidence.submissionSlotCount !== 4) {
    return { state: "drift", reason: "empty_submission_slot_set_mismatch" };
  }

  const nonzero = [
    ["requests", evidence.requestCount],
    ["candidates", evidence.candidateCount],
    ["decisions", evidence.decisionCount],
    ["occupied_slots", evidence.occupiedSubmissionSlotCount],
    ["owners", evidence.ownerCount],
    ["referenced_objects", evidence.referencedObjectCount],
    ["selected_catalog_items", evidence.selectedCatalogItemCount],
    ["in_flight", evidence.inFlightRequestCount ?? 0],
  ].find(([, count]) => count !== 0);
  if (nonzero) {
    return {
      state: "blocked_nonzero",
      reason: `${nonzero[0]}_remain`,
    };
  }
  return { state: "eligible_empty" };
}

export function buildExternalPhotoIdentificationPlan(
  evidence: ExternalPhotoIdentificationEvidence,
  providerConfiguration: ProviderConfigurationReceipt,
) {
  return stableValue({
    schemaVersion: "plantnet.complete-retirement.preflight.v1",
    environment: evidence.environment,
    databaseIdentity: evidence.databaseIdentity,
    providerConfiguration,
    tables: PROVIDER_TABLES,
    schemaDigest: evidence.schemaDigest,
    counts: {
      requests: evidence.requestCount,
      candidates: evidence.candidateCount,
      decisions: evidence.decisionCount,
      slots: evidence.submissionSlotCount,
      occupied_slots: evidence.occupiedSubmissionSlotCount,
      owners: evidence.ownerCount,
      referenced_objects: evidence.referencedObjectCount,
      selected_catalog_items: evidence.selectedCatalogItemCount,
      in_flight: evidence.inFlightRequestCount ?? 0,
    },
    requestStates: evidence.requestStates ?? {},
    candidateMappings: evidence.candidateMappings ?? {},
    decisions: evidence.decisions ?? {},
    intendedMutation: {
      dropTables: PROVIDER_TABLES,
      deleteProviderReceiptRows: true,
      preservePlantObjects: true,
      preserveCatalogItems: true,
      preserveJournalsAndMedia: true,
      removeVercelEnvironmentNames: [
        "PLANTNET_API_KEY",
        "PLANTNET_SPECIES_IDENTIFICATION_ENABLED",
      ],
    },
  });
}

export function stableRetirementDigest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function assertPreservationUnchanged<T>(before: T, after: T) {
  if (stableRetirementDigest(before) !== stableRetirementDigest(after)) {
    throw new Error("preservation aggregate drift");
  }
}

async function main() {
  const startedAt = performance.now();
  const args = parseExternalPhotoIdentificationRetirementArgs(
    process.argv.slice(2),
  );
  if (args.envFile) {
    await assertProtectedEnvFile(args.envFile);
    const result = loadEnv({
      path: args.envFile,
      override: true,
      quiet: true,
    });
    if (result.error) throw result.error;
  }
  assertProductionIdentity();
  const providerConfiguration = {
    apiKeyPresent: Boolean(process.env.PLANTNET_API_KEY),
    featureFlag: process.env.PLANTNET_SPECIES_IDENTIFICATION_ENABLED ?? null,
  };
  const pool = createProductionPool();
  try {
    if (args.mode === "apply") {
      const receipt = await applyRetirement(pool, args, providerConfiguration);
      printReceipt({
        ...receipt,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return;
    }

    const evidence = await collectReadOnlyEvidence(pool);
    const classification =
      classifyExternalPhotoIdentificationRetirement(evidence);
    const plan = buildExternalPhotoIdentificationPlan(
      evidence,
      providerConfiguration,
    );
    printReceipt({
      terminalState: args.mode === "verify" ? "verified" : "planned",
      classification,
      plan,
      planDigest: stableRetirementDigest(plan),
      preserved: evidence.preserved,
      preservedDigest: stableRetirementDigest({
        counts: evidence.preserved,
        sets: evidence.preservedSetDigests,
      }),
      durationMs: Math.round(performance.now() - startedAt),
    });
  } finally {
    await pool.end();
  }
}

async function applyRetirement(
  pool: Pool,
  args: Extract<RetirementOperatorArgs, { mode: "apply" }>,
  providerConfiguration: ProviderConfigurationReceipt,
) {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level serializable");
    await setTransactionBounds(client);
    await takeRetirementLock(client);

    const presence = await listPresentTables(client);
    if (presence.length === PROVIDER_TABLES.length) {
      await client.query(
        `lock table ${PROVIDER_TABLES.join(", ")} in access exclusive mode`,
      );
    }
    const before = await collectEvidence(client);
    const classification =
      classifyExternalPhotoIdentificationRetirement(before);
    if (classification.state === "already_absent") {
      await client.query("commit");
      return {
        terminalState: "already_absent",
        replay: true,
        preserved: before.preserved,
        preservedDigest: stableRetirementDigest({
          counts: before.preserved,
          sets: before.preservedSetDigests,
        }),
      };
    }
    if (classification.state !== "eligible_empty") {
      throw new Error(
        `ove351_retirement_blocked:${classification.state}:${classification.reason}`,
      );
    }
    const plan = buildExternalPhotoIdentificationPlan(
      before,
      providerConfiguration,
    );
    const planDigest = stableRetirementDigest(plan);
    if (
      planDigest !== APPROVED_EMPTY_PLAN_DIGEST ||
      planDigest !== args.approvedPlanDigest
    ) {
      throw new Error("ove351_approved_plan_digest_drifted");
    }

    const preservedBefore = {
      counts: before.preserved,
      sets: before.preservedSetDigests,
    };
    const migration = await readFile(
      fileURLToPath(
        new URL(
          "../sql/0037_ove351_retire_external_photo_identification.sql",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    await client.query(migration);
    const preservedAfter = await collectPreservedSnapshot(client);
    assertPreservationUnchanged(preservedBefore, preservedAfter);
    await client.query("commit");

    const verified = await collectReadOnlyEvidence(pool);
    const verifiedClassification =
      classifyExternalPhotoIdentificationRetirement(verified);
    if (verifiedClassification.state !== "already_absent") {
      throw new Error("ove351_post_apply_absence_inconclusive");
    }
    assertPreservationUnchanged(preservedBefore, {
      counts: verified.preserved,
      sets: verified.preservedSetDigests,
    });
    return {
      terminalState: "applied",
      migration: "0037_ove351_retire_external_photo_identification.sql",
      approvedPlanDigest: planDigest,
      schemaDigest: before.schemaDigest,
      preserved: verified.preserved,
      preservedDigest: stableRetirementDigest(preservedBefore),
      tableCountAfter: verified.presentTables.length,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function collectReadOnlyEvidence(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    await setTransactionBounds(client);
    await takeRetirementLock(client);
    const evidence = await collectEvidence(client);
    await client.query("commit");
    return evidence;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function collectEvidence(
  client: PoolClient,
): Promise<ExternalPhotoIdentificationEvidence> {
  const presentTables = await listPresentTables(client);
  const completeTableSet = presentTables.length === PROVIDER_TABLES.length;
  const counts = completeTableSet
    ? await client.query<{
        requests: number;
        candidates: number;
        decisions: number;
        slots: number;
        occupied_slots: number;
        owners: number;
        referenced_objects: number;
        selected_catalog_items: number;
        in_flight: number;
      }>(`
        select
          (select count(*)::int from plant_identification_requests) as requests,
          (select count(*)::int from plant_identification_candidates) as candidates,
          (select count(*)::int from plant_identification_decisions) as decisions,
          (select count(*)::int from plant_identification_submission_slots) as slots,
          (select count(*)::int from plant_identification_submission_slots where request_id is not null) as occupied_slots,
          (select count(distinct owner_user_id)::int from plant_identification_requests) as owners,
          (select count(distinct plant_object_id)::int from plant_identification_requests where plant_object_id is not null) as referenced_objects,
          (select count(distinct selected_catalog_item_id)::int from plant_identification_decisions where selected_catalog_item_id is not null) as selected_catalog_items,
          (select count(*)::int from plant_identification_requests where state = 'submitting') as in_flight
      `)
    : null;
  const count = counts?.rows[0];
  const schemaRows = await collectSchemaRows(client);
  const preserved = await collectPreservedSnapshot(client);

  return {
    version: "ove351.externalPhotoIdentificationRetirement.v1",
    environment: "production",
    databaseIdentity: "digitalocean_overgarden_production",
    schemaDigest: stableRetirementDigest(schemaRows),
    presentTables,
    requestCount: count?.requests ?? 0,
    candidateCount: count?.candidates ?? 0,
    decisionCount: count?.decisions ?? 0,
    submissionSlotCount: count?.slots ?? 0,
    occupiedSubmissionSlotCount: count?.occupied_slots ?? 0,
    ownerCount: count?.owners ?? 0,
    referencedObjectCount: count?.referenced_objects ?? 0,
    selectedCatalogItemCount: count?.selected_catalog_items ?? 0,
    inFlightRequestCount: count?.in_flight ?? 0,
    requestStates: completeTableSet
      ? await grouped(client, "plant_identification_requests", "state")
      : {},
    candidateMappings: completeTableSet
      ? await grouped(
          client,
          "plant_identification_candidates",
          "mapping_status",
        )
      : {},
    decisions: completeTableSet
      ? await grouped(client, "plant_identification_decisions", "decision")
      : {},
    preserved: preserved.counts,
    preservedSetDigests: preserved.sets,
  };
}

async function collectSchemaRows(client: PoolClient) {
  const [columns, constraints, indexes] = await Promise.all([
    client.query(
      `select table_name, column_name, data_type, is_nullable,
              coalesce(column_default, '') as column_default
       from information_schema.columns
       where table_schema = 'public' and table_name = any($1::text[])
       order by table_name, ordinal_position`,
      [PROVIDER_TABLES],
    ),
    client.query(
      `select c.relname as table_name, con.conname,
              pg_get_constraintdef(con.oid, true) as definition
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = any($1::text[])
       order by c.relname, con.conname`,
      [PROVIDER_TABLES],
    ),
    client.query(
      `select tablename as table_name, indexname, indexdef
       from pg_indexes
       where schemaname = 'public' and tablename = any($1::text[])
       order by tablename, indexname`,
      [PROVIDER_TABLES],
    ),
  ]);
  return {
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
  };
}

async function collectPreservedSnapshot(client: PoolClient) {
  const result = await client.query<
    Record<keyof PreservedAggregates, number> &
      Record<`${keyof PreservedAggregates}Digest`, string>
  >(`
    select
      (select count(*)::int from plant_objects) as "plantObjects",
      (select count(*)::int from journal_entries) as "journalEntries",
      (select count(*)::int from media_assets) as "mediaAssets",
      (select count(*)::int from catalog_items) as "catalogItems",
      (select count(*)::int from lineage_provenance_edges) as "lineageEdges",
      (select count(*)::int from analytics_events) as "analyticsEvents",
      (select count(*)::int from catalog_source_records) as "sourceRegistryRows",
      (select md5(coalesce(string_agg(id::text, ',' order by id), '')) from plant_objects) as "plantObjectsDigest",
      (select md5(coalesce(string_agg(id::text, ',' order by id), '')) from journal_entries) as "journalEntriesDigest",
      (select md5(coalesce(string_agg(id::text, ',' order by id), '')) from media_assets) as "mediaAssetsDigest",
      (select md5(coalesce(string_agg(id::text, ',' order by id), '')) from catalog_items) as "catalogItemsDigest",
      (select md5(coalesce(string_agg(id::text, ',' order by id), '')) from lineage_provenance_edges) as "lineageEdgesDigest",
      (select md5(coalesce(string_agg(id::text, ',' order by id), '')) from analytics_events) as "analyticsEventsDigest",
      (select md5(coalesce(string_agg(id::text, ',' order by id), '')) from catalog_source_records) as "sourceRegistryRowsDigest"
  `);
  const row = result.rows[0]!;
  const counts: PreservedAggregates = {
    plantObjects: row.plantObjects,
    journalEntries: row.journalEntries,
    mediaAssets: row.mediaAssets,
    catalogItems: row.catalogItems,
    lineageEdges: row.lineageEdges,
    analyticsEvents: row.analyticsEvents,
    sourceRegistryRows: row.sourceRegistryRows,
  };
  const sets = {
    plantObjects: row.plantObjectsDigest,
    journalEntries: row.journalEntriesDigest,
    mediaAssets: row.mediaAssetsDigest,
    catalogItems: row.catalogItemsDigest,
    lineageEdges: row.lineageEdgesDigest,
    analyticsEvents: row.analyticsEventsDigest,
    sourceRegistryRows: row.sourceRegistryRowsDigest,
  };
  return { counts, sets };
}

async function listPresentTables(client: PoolClient) {
  const result = await client.query<{ table_name: string; present: boolean }>(
    `select table_name,
            to_regclass('public.' || table_name) is not null as present
     from unnest($1::text[]) as retired_table(table_name)`,
    [PROVIDER_TABLES],
  );
  return result.rows.filter((row) => row.present).map((row) => row.table_name);
}

async function grouped(client: PoolClient, table: string, column: string) {
  if (!PROVIDER_TABLES.includes(table as (typeof PROVIDER_TABLES)[number])) {
    throw new Error("unsupported retired table");
  }
  if (!new Set(["state", "mapping_status", "decision"]).has(column)) {
    throw new Error("unsupported retired grouping");
  }
  const result = await client.query<{ key: string; count: number }>(
    `select ${column} as key, count(*)::int as count
     from ${table}
     group by ${column}
     order by ${column}`,
  );
  return Object.fromEntries(result.rows.map((row) => [row.key, row.count]));
}

async function setTransactionBounds(client: PoolClient) {
  await client.query("set local lock_timeout = '5s'");
  await client.query("set local statement_timeout = '20s'");
}

async function takeRetirementLock(client: PoolClient) {
  const result = await client.query<{ locked: boolean }>(
    "select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as locked",
    [ADVISORY_LOCK_NAME],
  );
  if (!result.rows[0]?.locked) {
    throw new Error("ove351_operator_lock_unavailable");
  }
}

async function assertProtectedEnvFile(envFile: string) {
  const metadata = await stat(envFile);
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error("production env file must be mode 0600");
  }
}

function assertProductionIdentity() {
  if (process.env.VERCEL_ENV !== "production") {
    throw new Error("production_environment_required");
  }
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  if (
    databaseUrl.hostname !== EXPECTED_DATABASE.hostname ||
    databaseUrl.port !== EXPECTED_DATABASE.port ||
    databaseUrl.pathname.slice(1) !== EXPECTED_DATABASE.database
  ) {
    throw new Error("production_database_identity_drifted");
  }
}

function createProductionPool() {
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  databaseUrl.searchParams.delete("sslmode");
  return new Pool({
    connectionString: databaseUrl.toString(),
    max: 2,
    ssl: { rejectUnauthorized: false },
  });
}

function valueFor(argv: readonly string[], name: string) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1]?.trim();
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [
        key,
        stableValue((value as Record<string, unknown>)[key]),
      ]),
  );
}

function printReceipt(receipt: Record<string, unknown>) {
  console.log(JSON.stringify(stableValue(receipt)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(
      JSON.stringify({
        version: "ove351.externalPhotoIdentificationRetirement.v1",
        terminalState: "inconclusive",
        errorClass:
          error instanceof Error && /lock/i.test(error.message)
            ? "lock_or_concurrency"
            : error instanceof Error && /timeout/i.test(error.message)
              ? "timeout"
              : "blocked",
      }),
    );
    process.exitCode = 1;
  });
}
