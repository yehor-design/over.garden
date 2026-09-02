import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";

const TEMP_DATABASE_PREFIX = "overgarden_ove349_verify_";
const USER_ID = "00000000-0000-4000-8000-000000000349";
const SPACE_ID = "00000000-0000-4000-8000-000000003490";
const ENTRY_ID = "00000000-0000-4000-8000-000000003491";
const MEDIA_ID = "00000000-0000-4000-8000-000000003492";

async function main() {
  const startedAt = performance.now();
  assertLoopbackLocalRuntimeEnvironment(process.env);
  const baseUrl = required("DATABASE_URL");
  const databaseName = `${TEMP_DATABASE_PREFIX}${randomBytes(6).toString("hex")}`;
  assertTemporaryDatabaseName(databaseName);
  const adminPool = new Pool({ connectionString: baseUrl, max: 1 });
  let created = false;

  try {
    await adminPool.query(`create database ${quoteIdentifier(databaseName)}`);
    created = true;
    const databaseUrl = withDatabase(baseUrl, databaseName);
    bootstrapDatabase(databaseUrl);
    verifyGeneratedTypes(databaseUrl);

    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await seedFinalPublicState(pool);
      const firstSchemaDigest = await contractedSchemaDigest(pool);
      const firstDataDigest = await preservedDataDigest(pool);

      await pool.query(
        readSql(
          "../sql/rollback/0038_ove349_retire_legacy_journal_media.down.sql",
        ),
      );
      await assertCompatibilityShape(pool);
      if ((await preservedDataDigest(pool)) !== firstDataDigest) {
        throw new Error("ove349_down_migration_mutated_final_data");
      }

      const migration = readSql(
        "../sql/0038_ove349_retire_legacy_journal_media.sql",
      );
      await pool.query(migration);
      const secondSchemaDigest = await contractedSchemaDigest(pool);
      const secondDataDigest = await preservedDataDigest(pool);
      if (secondSchemaDigest !== firstSchemaDigest) {
        throw new Error("ove349_up_down_up_schema_drift");
      }
      if (secondDataDigest !== firstDataDigest) {
        throw new Error("ove349_up_down_up_data_drift");
      }

      await pool.query(migration);
      const replaySchemaDigest = await contractedSchemaDigest(pool);
      if (replaySchemaDigest !== firstSchemaDigest) {
        throw new Error("ove349_migration_replay_schema_drift");
      }
      if ((await preservedDataDigest(pool)) !== firstDataDigest) {
        throw new Error("ove349_migration_replay_data_drift");
      }

      process.stdout.write(
        `${JSON.stringify({
          contract: "ove349.disposableMigration.v1",
          environment: "loopback_disposable_postgres",
          upDownUp: "passed",
          replay: "passed",
          generatedTypes: "matched",
          preservedPublicEntries: 1,
          preservedFinalMedia: 1,
          schemaDigest: firstSchemaDigest,
          dataDigest: firstDataDigest,
          durationMs: Math.round(performance.now() - startedAt),
        })}\n`,
      );
    } finally {
      await pool.end();
    }
  } finally {
    if (created) {
      await adminPool.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
        [databaseName],
      );
      await adminPool.query(`drop database ${quoteIdentifier(databaseName)}`);
    }
    await adminPool.end();
  }
}

function bootstrapDatabase(databaseUrl: string) {
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
      },
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `ove349_disposable_bootstrap_failed:${redactProcessOutput(`${result.stdout}\n${result.stderr}`)}`,
    );
  }
}

function verifyGeneratedTypes(databaseUrl: string) {
  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["db:types:check"],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: databaseUrl,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=react-server"]
          .filter(Boolean)
          .join(" "),
      },
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `ove349_disposable_generated_types_failed:${redactProcessOutput(`${result.stdout}\n${result.stderr}`)}`,
    );
  }
}

async function seedFinalPublicState(pool: Pool) {
  await pool.query(
    `insert into "user" (id, name, email, "emailVerified")
     values ($1, 'OVE-349 verifier', 'ove349-verifier@invalid.example', true)`,
    [USER_ID],
  );
  await pool.query(
    `insert into spaces (id, owner_user_id, display_name)
     values ($1, $2, 'OVE-349 disposable space')`,
    [SPACE_ID, USER_ID],
  );
  await pool.query(
    `insert into journal_entries (
       id, owner_user_id, space_id, title, body, entry_scope, visibility,
       lifecycle_state, public_slug, published_at, client_mutation_id,
       content_class
     ) values (
       $1, $2, $3, 'OVE-349 preserved entry', 'Disposable migration proof.',
       'space', 'public', 'active', 'ove-349-preserved-entry', now(),
       'ove349-disposable-migration', 'production_smoke'
     )`,
    [ENTRY_ID, USER_ID, SPACE_ID],
  );
  await pool.query(
    `insert into media_assets (
       id, owner_user_id, journal_entry_id, derivative_key, upload_generation,
       declared_size_bytes, usage_role, document_position, intrinsic_width,
       intrinsic_height, focal_x, focal_y, alt_text
     ) values (
       $1, $2, $3, 'derivatives/ove349-disposable.webp', 7, 349,
       'inline', 0, 640, 480, 0.5, 0.5, 'Disposable final WebP'
     )`,
    [MEDIA_ID, USER_ID, ENTRY_ID],
  );
}

async function contractedSchemaDigest(pool: Pool) {
  const result = await pool.query<{ signature: string | null }>(`
    select string_agg(signature, E'\n' order by signature) as signature
    from (
      select 'column:' || table_name || ':' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') as signature
      from information_schema.columns
      where table_schema = 'public' and table_name in ('journal_entries', 'media_assets')
      union all
      select 'constraint:' || rel.relname || ':' || con.conname || ':' || pg_get_constraintdef(con.oid)
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace namespace on namespace.oid = rel.relnamespace
      where namespace.nspname = 'public' and rel.relname in ('journal_entries', 'media_assets')
      union all
      select 'index:' || tablename || ':' || indexname || ':' || indexdef
      from pg_indexes
      where schemaname = 'public' and tablename in ('journal_entries', 'media_assets')
      union all
      select 'draft-table:' || coalesce(to_regclass('public.journal_entry_drafts')::text, 'absent')
    ) evidence
  `);
  const signature = result.rows[0]?.signature ?? "";
  if (!signature.includes("draft-table:absent")) {
    throw new Error("ove349_contracted_draft_table_present");
  }
  for (const marker of [
    "column:media_assets:derivative_key:text:NO",
    "column:media_assets:journal_entry_id:uuid:NO",
    "column:media_assets:upload_generation:integer:YES",
    "column:media_assets:declared_size_bytes:bigint:YES",
    "CHECK ((visibility = 'public'::text))",
  ]) {
    if (!signature.includes(marker)) {
      throw new Error(`ove349_contracted_schema_marker_missing:${marker}`);
    }
  }
  for (const retired of [
    "column:media_assets:quarantine_key:",
    "column:media_assets:status:",
    "column:media_assets:media_readiness_state:",
    "column:media_assets:processing_claim_token:",
  ]) {
    if (signature.includes(retired)) {
      throw new Error(`ove349_retired_schema_marker_present:${retired}`);
    }
  }
  return sha256(signature);
}

async function assertCompatibilityShape(pool: Pool) {
  const result = await pool.query<{
    draft_table_present: boolean;
    legacy_columns: string;
    visibility_default: string | null;
    visibility_constraint: string | null;
  }>(`
    select
      to_regclass('public.journal_entry_drafts') is not null as draft_table_present,
      (select count(*)::text from information_schema.columns
       where table_schema = 'public' and table_name = 'media_assets'
         and column_name in (
           'quarantine_key', 'status', 'original_deleted_at', 'declared_media_type',
           'admitted_media_type', 'media_readiness_state', 'processing_claim_token',
           'processing_claimed_at', 'upload_generation_id', 'public_object_id',
           'quality_policy_version', 'quality_class', 'quality_reason_codes',
           'quality_metrics', 'quality_evaluated_at'
         )) as legacy_columns,
      (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'journal_entries'
         and column_name = 'visibility') as visibility_default,
      (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'journal_entries'::regclass
         and conname = 'journal_entries_visibility_check') as visibility_constraint
  `);
  const row = result.rows[0];
  if (
    !row?.draft_table_present ||
    Number(row.legacy_columns) !== 15 ||
    !row.visibility_default?.includes("'private'") ||
    !row.visibility_constraint?.includes("'private'") ||
    !row.visibility_constraint.includes("'public'")
  ) {
    throw new Error("ove349_down_migration_compatibility_shape_drift");
  }
}

async function preservedDataDigest(pool: Pool) {
  const result = await pool.query<{
    entry_id: string;
    visibility: string;
    lifecycle_state: string;
    media_id: string;
    derivative_key: string;
    upload_generation: string | null;
    declared_size_bytes: string | null;
    usage_role: string;
    document_position: number | null;
    revoked: boolean;
    unreachable: boolean;
  }>(
    `
    select entry.id::text as entry_id, entry.visibility, entry.lifecycle_state,
      media.id::text as media_id, media.derivative_key,
      media.upload_generation::text, media.declared_size_bytes::text,
      media.usage_role, media.document_position,
      media.revoked_at is not null as revoked,
      media.public_unreachable_at is not null as unreachable
    from journal_entries entry
    join media_assets media on media.journal_entry_id = entry.id
    where entry.id = $1 and media.id = $2
  `,
    [ENTRY_ID, MEDIA_ID],
  );
  if (result.rows.length !== 1) {
    throw new Error("ove349_preserved_final_fixture_missing");
  }
  return sha256(JSON.stringify(result.rows[0]));
}

function readSql(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function withDatabase(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function assertTemporaryDatabaseName(databaseName: string) {
  if (!/^overgarden_ove349_verify_[a-f0-9]{12}$/.test(databaseName)) {
    throw new Error("ove349_invalid_temporary_database_name");
  }
}

function quoteIdentifier(value: string) {
  assertTemporaryDatabaseName(value);
  return `"${value}"`;
}

function redactProcessOutput(output: string) {
  return output
    .trim()
    .split("\n")
    .slice(-20)
    .join(" | ")
    .replaceAll(/postgres(?:ql)?:\/\/\S+/giu, "[redacted]");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment value ${name}.`);
  return value;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "ove349_migration_verifier_failed"}\n`,
  );
  process.exitCode = 1;
});
