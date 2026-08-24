import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

export const OVE349_BRIDGE_APPROVED_SCHEMA_DIGEST =
  "d6d20fd5f90aa1400dca3af171924590e521086ce97e08e6a99999e4fa28e906";
export const OVE349_BRIDGE_APPLY_CONFIRMATION =
  "prepare-ove349-final-writer-bridge" as const;
export const OVE349_BRIDGE_ROLLBACK_CONFIRMATION =
  "rollback-ove349-final-writer-bridge" as const;

const EXPECTED_DATABASE = {
  hostname:
    "overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com",
  port: "25060",
  database: "defaultdb",
} as const;
const BRIDGE_LOCK = "overgarden:ove349:schema-compatibility-bridge";
const TEMP_DATABASE_PREFIX = "overgarden_ove349_bridge_";
const LEGACY_MEDIA_COLUMN_COUNT = 15;

export type BridgeDefaultClass = "prior" | "bridge" | "drift";

export type BridgeArgs =
  | { mode: "preflight"; envFile?: string }
  | { mode: "local-proof"; envFile?: string }
  | { mode: "verify"; envFile?: string; bridgeReceipt: string }
  | {
      mode: "apply";
      envFile?: string;
      approvedSchemaDigest: typeof OVE349_BRIDGE_APPROVED_SCHEMA_DIGEST;
      confirmProduction: typeof OVE349_BRIDGE_APPLY_CONFIRMATION;
    }
  | {
      mode: "rollback";
      envFile?: string;
      bridgeReceipt: string;
      confirmProduction: typeof OVE349_BRIDGE_ROLLBACK_CONFIRMATION;
    };

type DefaultMap = Record<string, string | null>;
type QueryExecutor = Pool | PoolClient;

interface BridgeCounts {
  drafts: number;
  journalEntries: number;
  publicEntries: number;
  mediaAssets: number;
  publicMedia: number;
  jobs: number;
}

interface BridgeEvidence {
  version: "ove349.schemaCompatibilityBridge.v1";
  environment: "production" | "loopback_disposable_postgres";
  databaseIdentity:
    | "digitalocean_overgarden_production"
    | "ove349_disposable_local";
  schemaDigest: string;
  schemaState: "legacy" | "contracted" | "drift";
  defaultsClass: BridgeDefaultClass | "absent";
  counts: BridgeCounts;
}

const BRIDGE_SQL = `
alter table media_assets
  alter column quarantine_key set default ('retired-compat/' || gen_random_uuid()::text),
  alter column status set default 'processed',
  alter column original_deleted_at set default now(),
  alter column declared_media_type set default 'image/webp',
  alter column admitted_media_type set default 'image/webp',
  alter column media_readiness_state set default 'public_ready',
  alter column upload_generation_id set default gen_random_uuid(),
  alter column public_object_id set default gen_random_uuid()
`;

const ROLLBACK_SQL = `
alter table media_assets
  alter column quarantine_key drop default,
  alter column status set default 'quarantined',
  alter column original_deleted_at drop default,
  alter column declared_media_type drop default,
  alter column admitted_media_type drop default,
  alter column media_readiness_state set default 'legacy_non_ready',
  alter column upload_generation_id drop default,
  alter column public_object_id drop default
`;

const BRIDGED_COLUMNS = [
  "quarantine_key",
  "status",
  "original_deleted_at",
  "declared_media_type",
  "admitted_media_type",
  "media_readiness_state",
  "upload_generation_id",
  "public_object_id",
] as const;

export function classifyBridgeDefaults(defaults: DefaultMap): BridgeDefaultClass {
  const normalized = Object.fromEntries(
    BRIDGED_COLUMNS.map((column) => [
      column,
      defaults[column]?.replaceAll(/\s+/g, "").toLowerCase() ?? null,
    ]),
  );
  const prior =
    normalized.quarantine_key === null &&
    normalized.status === "'quarantined'::text" &&
    normalized.original_deleted_at === null &&
    normalized.declared_media_type === null &&
    normalized.admitted_media_type === null &&
    normalized.media_readiness_state === "'legacy_non_ready'::text" &&
    normalized.upload_generation_id === null &&
    normalized.public_object_id === null;
  if (prior) return "prior";

  const bridge =
    normalized.quarantine_key?.includes("retired-compat/") === true &&
    normalized.quarantine_key.includes("gen_random_uuid()") &&
    normalized.status === "'processed'::text" &&
    normalized.original_deleted_at === "now()" &&
    normalized.declared_media_type === "'image/webp'::text" &&
    normalized.admitted_media_type === "'image/webp'::text" &&
    normalized.media_readiness_state === "'public_ready'::text" &&
    normalized.upload_generation_id === "gen_random_uuid()" &&
    normalized.public_object_id === "gen_random_uuid()";
  return bridge ? "bridge" : "drift";
}

export function stableBridgeDigest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export function bridgeReceiptDigest(evidence: BridgeEvidence): string {
  return stableBridgeDigest({
    version: evidence.version,
    environment: evidence.environment,
    databaseIdentity: evidence.databaseIdentity,
    schemaDigest: evidence.schemaDigest,
    schemaState: evidence.schemaState,
    defaultsClass: evidence.defaultsClass,
  });
}

export function parseBridgeArgs(argv: readonly string[]): BridgeArgs {
  const values = parseNamedArgs(argv);
  const mode = values.get("mode");
  const envFile = values.get("env-file");
  if (mode === "preflight" || mode === "local-proof") {
    return { mode, ...(envFile ? { envFile } : {}) };
  }
  if (mode === "apply") {
    const approvedSchemaDigest = requireSha256(
      values,
      "approved-schema-digest",
      "approved schema digest",
    );
    if (approvedSchemaDigest !== OVE349_BRIDGE_APPROVED_SCHEMA_DIGEST) {
      throw new Error("The schema digest is not the approved OVE-349 baseline.");
    }
    const confirmation = values.get("confirm-production");
    if (confirmation !== OVE349_BRIDGE_APPLY_CONFIRMATION) {
      throw new Error("The exact OVE-349 bridge apply confirmation is required.");
    }
    return {
      mode,
      ...(envFile ? { envFile } : {}),
      approvedSchemaDigest,
      confirmProduction: confirmation,
    };
  }
  if (mode === "verify") {
    return {
      mode,
      ...(envFile ? { envFile } : {}),
      bridgeReceipt: requireSha256(values, "bridge-receipt", "bridge receipt"),
    };
  }
  if (mode === "rollback") {
    const confirmation = values.get("confirm-production");
    if (confirmation !== OVE349_BRIDGE_ROLLBACK_CONFIRMATION) {
      throw new Error(
        "The exact OVE-349 bridge rollback confirmation is required.",
      );
    }
    return {
      mode,
      ...(envFile ? { envFile } : {}),
      bridgeReceipt: requireSha256(values, "bridge-receipt", "bridge receipt"),
      confirmProduction: confirmation,
    };
  }
  throw new Error(
    "Choose --mode preflight, apply, verify, rollback, or local-proof for the OVE-349 bridge.",
  );
}

async function main() {
  const args = parseBridgeArgs(process.argv.slice(2));
  if (args.envFile) {
    const loaded = loadEnv({ path: args.envFile, override: false, quiet: true });
    if (loaded.error) throw loaded.error;
  }
  if (args.mode === "local-proof") {
    await runDisposableProof();
    return;
  }

  assertProductionEnvironment();
  const pool = createProductionPool();
  try {
    if (args.mode === "preflight") {
      const evidence = await collectEvidence(pool, "production");
      assertLegacySchema(evidence);
      printReceipt({
        operation: "preflight",
        evidence,
        evidenceDigest: stableBridgeDigest(evidence),
      });
      return;
    }
    if (args.mode === "verify") {
      const evidence = await collectEvidence(pool, "production");
      assertBridgeEvidence(evidence);
      const bridgeReceipt = bridgeReceiptDigest(evidence);
      if (bridgeReceipt !== args.bridgeReceipt) {
        throw new Error("ove349_bridge_receipt_drifted");
      }
      printReceipt({ operation: "verify", bridgeReceipt, evidence });
      return;
    }
    if (args.mode === "apply") {
      const before = await collectEvidence(pool, "production");
      assertLegacySchema(before);
      if (before.schemaDigest !== args.approvedSchemaDigest) {
        throw new Error("ove349_bridge_schema_digest_drifted");
      }
      if (before.defaultsClass === "bridge") {
        printReceipt({
          operation: "apply",
          replay: true,
          bridgeReceipt: bridgeReceiptDigest(before),
          evidence: before,
        });
        return;
      }
      if (before.defaultsClass !== "prior") {
        throw new Error("ove349_bridge_prior_defaults_drifted");
      }
      await mutateDefaults(pool, BRIDGE_SQL, "prior");
      const after = await collectEvidence(pool, "production");
      assertBridgeEvidence(after);
      assertCountsEqual(before.counts, after.counts);
      printReceipt({
        operation: "apply",
        replay: false,
        bridgeReceipt: bridgeReceiptDigest(after),
        beforeEvidenceDigest: stableBridgeDigest(before),
        evidence: after,
      });
      return;
    }

    if (args.mode !== "rollback") {
      const _exhaustive: never = args;
      throw new Error(`Unsupported OVE-349 bridge mode: ${String(_exhaustive)}`);
    }
    const before = await collectEvidence(pool, "production");
    assertLegacySchema(before);
    if (before.defaultsClass === "prior") {
      printReceipt({
        operation: "rollback",
        replay: true,
        priorEvidenceDigest: stableBridgeDigest(before),
        evidence: before,
      });
      return;
    }
    assertBridgeEvidence(before);
    if (bridgeReceiptDigest(before) !== args.bridgeReceipt) {
      throw new Error("ove349_bridge_rollback_receipt_drifted");
    }
    await mutateDefaults(pool, ROLLBACK_SQL, "bridge");
    const after = await collectEvidence(pool, "production");
    assertLegacySchema(after);
    if (after.defaultsClass !== "prior") {
      throw new Error("ove349_bridge_rollback_readback_failed");
    }
    assertCountsEqual(before.counts, after.counts);
    printReceipt({
      operation: "rollback",
      replay: false,
      priorEvidenceDigest: stableBridgeDigest(after),
      evidence: after,
    });
  } finally {
    await pool.end();
  }
}

async function mutateDefaults(
  pool: Pool,
  statement: string,
  expectedClass: "prior" | "bridge",
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [BRIDGE_LOCK],
    );
    await client.query(
      `lock table journal_entry_drafts, journal_entries, media_assets, job_queue
       in share row exclusive mode`,
    );
    const locked = await collectEvidence(client, environmentClass());
    assertLegacySchema(locked);
    if (locked.defaultsClass !== expectedClass) {
      throw new Error(`ove349_bridge_locked_defaults_${locked.defaultsClass}`);
    }
    await client.query(statement);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function collectEvidence(
  executor: QueryExecutor,
  environment: BridgeEvidence["environment"],
): Promise<BridgeEvidence> {
  const schema = await executor.query<{
    signature: string | null;
    draft_table_present: boolean;
    retired_media_columns: string;
  }>(`
    select
      (select string_agg(table_name || ':' || column_name || ':' || data_type || ':' || is_nullable, ',' order by table_name, ordinal_position)
       from information_schema.columns
       where table_schema = 'public'
         and table_name in ('journal_entry_drafts', 'journal_entries', 'media_assets', 'job_queue')) as signature,
      to_regclass('public.journal_entry_drafts') is not null as draft_table_present,
      (select count(*)::text
       from information_schema.columns
       where table_schema = 'public' and table_name = 'media_assets'
         and column_name in (
           'quarantine_key', 'status', 'original_deleted_at', 'declared_media_type',
           'admitted_media_type', 'media_readiness_state', 'processing_claim_token',
           'processing_claimed_at', 'upload_generation_id', 'public_object_id',
           'quality_policy_version', 'quality_class', 'quality_reason_codes',
           'quality_metrics', 'quality_evaluated_at'
         )) as retired_media_columns
  `);
  const row = schema.rows[0];
  if (!row) throw new Error("ove349_bridge_schema_read_missing");
  const retiredColumns = Number(row.retired_media_columns);
  const schemaState =
    row.draft_table_present && retiredColumns === LEGACY_MEDIA_COLUMN_COUNT
      ? "legacy"
      : !row.draft_table_present && retiredColumns === 0
        ? "contracted"
        : "drift";
  const defaults: DefaultMap = {};
  if (schemaState === "legacy") {
    const result = await executor.query<{
      column_name: string;
      column_default: string | null;
    }>(
      `select column_name, column_default
       from information_schema.columns
       where table_schema = 'public' and table_name = 'media_assets'
         and column_name = any($1::text[])
       order by column_name`,
      [BRIDGED_COLUMNS],
    );
    for (const item of result.rows) defaults[item.column_name] = item.column_default;
  }
  const draftCountExpression = row.draft_table_present
    ? "(select count(*) from journal_entry_drafts)::text"
    : "'0'::text";
  const counts = numbers(
    await one(executor, `
      select
        ${draftCountExpression} as drafts,
        (select count(*) from journal_entries)::text as journal_entries,
        (select count(*) from journal_entries where visibility = 'public')::text as public_entries,
        (select count(*) from media_assets)::text as media_assets,
        (select count(*) from media_assets media
          join journal_entries entry on entry.id = media.journal_entry_id
          where entry.visibility = 'public')::text as public_media,
        (select count(*) from job_queue)::text as jobs
    `),
  );
  return {
    version: "ove349.schemaCompatibilityBridge.v1",
    environment,
    databaseIdentity:
      environment === "production"
        ? "digitalocean_overgarden_production"
        : "ove349_disposable_local",
    schemaDigest: stableTextDigest(row.signature ?? ""),
    schemaState,
    defaultsClass:
      schemaState === "legacy" ? classifyBridgeDefaults(defaults) : "absent",
    counts: {
      drafts: counts.drafts,
      journalEntries: counts.journal_entries,
      publicEntries: counts.public_entries,
      mediaAssets: counts.media_assets,
      publicMedia: counts.public_media,
      jobs: counts.jobs,
    },
  };
}

function assertLegacySchema(evidence: BridgeEvidence) {
  if (
    evidence.schemaState !== "legacy" ||
    (evidence.environment === "production" &&
      evidence.schemaDigest !== OVE349_BRIDGE_APPROVED_SCHEMA_DIGEST)
  ) {
    throw new Error("ove349_bridge_legacy_schema_identity_drifted");
  }
  if (evidence.defaultsClass === "drift" || evidence.defaultsClass === "absent") {
    throw new Error("ove349_bridge_default_shape_drifted");
  }
}

function assertBridgeEvidence(evidence: BridgeEvidence) {
  assertLegacySchema(evidence);
  if (evidence.defaultsClass !== "bridge") {
    throw new Error("ove349_bridge_not_applied");
  }
}

function assertCountsEqual(before: BridgeCounts, after: BridgeCounts) {
  if (stableBridgeDigest(before) !== stableBridgeDigest(after)) {
    throw new Error("ove349_bridge_changed_rows");
  }
}

async function runDisposableProof() {
  const baseUrl = required("DATABASE_URL");
  assertLoopbackDatabase(baseUrl);
  const databaseName = `${TEMP_DATABASE_PREFIX}${randomBytes(6).toString("hex")}`;
  assertTemporaryDatabaseName(databaseName);
  const admin = new Pool({ connectionString: baseUrl, max: 1 });
  let created = false;
  try {
    await admin.query(`create database ${quoteIdentifier(databaseName)}`);
    created = true;
    const databaseUrl = withDatabase(baseUrl, databaseName);
    bootstrapDatabase(databaseUrl, databaseName);
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const initial = await collectEvidence(
        pool,
        "loopback_disposable_postgres",
      );
      assertLegacySchema(initial);
      if (initial.defaultsClass !== "prior") {
        throw new Error("ove349_bridge_local_prior_defaults_drifted");
      }
      await mutateDefaults(pool, BRIDGE_SQL, "prior");
      const prepared = await collectEvidence(
        pool,
        "loopback_disposable_postgres",
      );
      assertBridgeEvidence(prepared);
      assertCountsEqual(initial.counts, prepared.counts);

      await seedFinalWriterParents(pool);
      await insertFinalWriterMedia(pool, "00000000-0000-4000-8000-000000003493");
      const inserted = await pool.query<{
        quarantine_key: string;
        status: string;
        media_readiness_state: string;
        declared_media_type: string;
        admitted_media_type: string;
        original_deleted_at: Date | null;
        upload_generation_id: string | null;
        public_object_id: string | null;
      }>(
        `select quarantine_key, status, media_readiness_state,
          declared_media_type, admitted_media_type, original_deleted_at,
          upload_generation_id, public_object_id
         from media_assets where id = $1`,
        ["00000000-0000-4000-8000-000000003493"],
      );
      const finalRow = inserted.rows[0];
      if (
        !finalRow?.quarantine_key.startsWith("retired-compat/") ||
        finalRow.status !== "processed" ||
        finalRow.media_readiness_state !== "public_ready" ||
        finalRow.declared_media_type !== "image/webp" ||
        finalRow.admitted_media_type !== "image/webp" ||
        !finalRow.original_deleted_at ||
        !finalRow.upload_generation_id ||
        !finalRow.public_object_id
      ) {
        throw new Error("ove349_bridge_final_writer_default_proof_failed");
      }
      await pool.query("delete from media_assets where id = $1", [
        "00000000-0000-4000-8000-000000003493",
      ]);

      await mutateDefaults(pool, ROLLBACK_SQL, "bridge");
      const rolledBack = await collectEvidence(
        pool,
        "loopback_disposable_postgres",
      );
      if (rolledBack.defaultsClass !== "prior") {
        throw new Error("ove349_bridge_local_rollback_failed");
      }
      let finalWriterBlockedWithoutBridge = false;
      try {
        await insertFinalWriterMedia(pool, "00000000-0000-4000-8000-000000003494");
      } catch (error) {
        finalWriterBlockedWithoutBridge =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23502";
      }
      if (!finalWriterBlockedWithoutBridge) {
        throw new Error("ove349_bridge_missing_failure_was_not_reproduced");
      }

      await mutateDefaults(pool, BRIDGE_SQL, "prior");
      await insertFinalWriterMedia(pool, "00000000-0000-4000-8000-000000003494");
      await pool.query("delete from journal_entries where id = $1", [
        "00000000-0000-4000-8000-000000003491",
      ]);
      await pool.query("delete from spaces where id = $1", [
        "00000000-0000-4000-8000-000000003490",
      ]);
      await pool.query('delete from "user" where id = $1', [
        "00000000-0000-4000-8000-000000000349",
      ]);
      const replay = await collectEvidence(
        pool,
        "loopback_disposable_postgres",
      );
      assertBridgeEvidence(replay);
      assertCountsEqual(initial.counts, replay.counts);
      printReceipt({
        operation: "local-proof",
        missingBridgeFailureReproduced: true,
        finalWriterAcceptedAfterBridge: true,
        rollbackRestoredPriorDefaults: true,
        replayAccepted: true,
        rowCountsPreserved: true,
        bridgeReceipt: bridgeReceiptDigest(replay),
      });
    } finally {
      await pool.end();
    }
  } finally {
    if (created) {
      await admin.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
        [databaseName],
      );
      await admin.query(`drop database ${quoteIdentifier(databaseName)}`);
    }
    await admin.end();
  }
}

async function seedFinalWriterParents(pool: Pool) {
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified")
     values ($1, 'OVE-349 bridge verifier', 'ove349-bridge@invalid.example', true)`,
    ["00000000-0000-4000-8000-000000000349"],
  );
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name)
     values ($1, $2, 'OVE-349 bridge space')`,
    [
      "00000000-0000-4000-8000-000000003490",
      "00000000-0000-4000-8000-000000000349",
    ],
  );
  await pool.query(
    `insert into journal_entries (
       id, owner_user_id, space_id, title, body, entry_scope, visibility,
       lifecycle_state, public_slug, published_at, client_mutation_id,
       content_class
     ) values (
       $1, $2, $3, 'OVE-349 bridge entry', 'Disposable bridge proof.',
       'space', 'public', 'active', 'ove-349-bridge-entry', now(),
       'ove349-bridge-proof', 'production_smoke'
     )`,
    [
      "00000000-0000-4000-8000-000000003491",
      "00000000-0000-4000-8000-000000000349",
      "00000000-0000-4000-8000-000000003490",
    ],
  );
}

async function insertFinalWriterMedia(pool: Pool, mediaId: string) {
  await pool.query(
    `insert into media_assets (
       id, owner_user_id, journal_entry_id, upload_generation,
       declared_size_bytes, derivative_key, intrinsic_width, intrinsic_height,
       focal_x, focal_y, usage_role, document_position, updated_at
     ) values (
       $1, $2, $3, 7, 349, $4, 640, 480, 0.5, 0.5, 'inline', 1, now()
     )`,
    [
      mediaId,
      "00000000-0000-4000-8000-000000000349",
      "00000000-0000-4000-8000-000000003491",
      `derivatives/${mediaId}/7.webp`,
    ],
  );
}

function bootstrapDatabase(databaseUrl: string, databaseName: string) {
  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["db:bootstrap", "--", "--env-file", "/dev/null"],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: databaseUrl,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=react-server"]
          .filter(Boolean)
          .join(" "),
        VISUAL_FIXTURES_DATABASE: databaseName,
      },
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `ove349_bridge_bootstrap_failed:${redactProcessOutput(`${result.stdout}\n${result.stderr}`)}`,
    );
  }
}

function createProductionPool() {
  const databaseUrl = new URL(required("DATABASE_URL"));
  if (
    databaseUrl.hostname !== EXPECTED_DATABASE.hostname ||
    databaseUrl.port !== EXPECTED_DATABASE.port ||
    databaseUrl.pathname.slice(1) !== EXPECTED_DATABASE.database
  ) {
    throw new Error("ove349_bridge_production_database_identity_drifted");
  }
  databaseUrl.searchParams.delete("sslmode");
  return new Pool({
    connectionString: databaseUrl.toString(),
    max: 1,
    ssl: { rejectUnauthorized: false },
  });
}

function assertProductionEnvironment() {
  if (process.env.VERCEL_ENV !== "production") {
    throw new Error("ove349_bridge_requires_vercel_production_environment");
  }
}

function environmentClass(): BridgeEvidence["environment"] {
  return process.env.VERCEL_ENV === "production"
    ? "production"
    : "loopback_disposable_postgres";
}

function assertLoopbackDatabase(connectionString: string) {
  const url = new URL(connectionString);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("ove349_bridge_local_proof_requires_loopback_postgres");
  }
}

function withDatabase(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function assertTemporaryDatabaseName(databaseName: string) {
  if (!/^overgarden_ove349_bridge_[a-f0-9]{12}$/.test(databaseName)) {
    throw new Error("ove349_bridge_invalid_temporary_database_name");
  }
}

function quoteIdentifier(value: string) {
  assertTemporaryDatabaseName(value);
  return `"${value}"`;
}

function parseNamedArgs(argv: readonly string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Invalid OVE-349 bridge argument near ${token ?? "end"}.`);
    }
    const name = token.slice(2);
    if (values.has(name)) throw new Error(`Duplicate --${name} argument.`);
    values.set(name, value);
  }
  const supported = new Set([
    "mode",
    "env-file",
    "approved-schema-digest",
    "bridge-receipt",
    "confirm-production",
  ]);
  for (const name of values.keys()) {
    if (!supported.has(name)) throw new Error(`Unsupported --${name} argument.`);
  }
  return values;
}

function requireSha256(
  values: Map<string, string>,
  name: string,
  label: string,
) {
  const value = values.get(name);
  if (!value || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`A lowercase SHA-256 ${label} is required.`);
  }
  return value;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function one(executor: QueryExecutor, query: string) {
  const result = await executor.query<Record<string, string>>(query);
  const row = result.rows[0];
  if (!row) throw new Error("ove349_bridge_aggregate_query_returned_no_row");
  return row;
}

function numbers(row: QueryResultRow) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(`ove349_bridge_invalid_aggregate:${key}`);
      }
      return [key, parsed];
    }),
  );
}

function stableTextDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`OVE-349 bridge requires ${name}.`);
  return value;
}

function redactProcessOutput(output: string) {
  return output
    .trim()
    .split("\n")
    .slice(-20)
    .join(" | ")
    .replaceAll(/postgres(?:ql)?:\/\/\S+/giu, "[redacted]");
}

function printReceipt(value: unknown) {
  const serialized = JSON.stringify(value, null, 2);
  if (/(?:postgres(?:ql)?:\/\/|@[a-z0-9.-]+|derivatives\/)/i.test(serialized)) {
    throw new Error("ove349_bridge_receipt_redaction_boundary_failed");
  }
  process.stdout.write(`${serialized}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
