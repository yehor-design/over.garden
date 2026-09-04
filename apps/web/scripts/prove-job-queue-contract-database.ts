/**
 * Executes the job queue contract's database half instead of compiling it.
 *
 * Two migrations here cannot be proved by reading them. `0051` replaces an
 * exact-array CHECK on the worker's handler set with a shape check, and the
 * first shape check written for it — a regex over `array_to_string(handlers,
 * ',')` — passed review and then accepted the single element
 * 'journal_entry_index,journal_entry_unindex', because after joining, one
 * element containing a separator is indistinguishable from two. Only running it
 * showed that. `0052` adds the four payload constraints that four declared
 * kinds never had, and a CHECK that accepts everything looks exactly like a
 * CHECK that works.
 *
 * It builds its own disposable database and drops it, so it never writes to the
 * database whose connection string it borrows.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import { loadVersionedApplicationSql } from "./application-sql";

/** Migrations this proof owns: the handler set, its shape, the payload checks. */
const CONTRACT_MIGRATIONS = /^(0050|0051|0052)_/u;

const UUID_A = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const UUID_B = "3f2504e0-4f89-41d3-9a0c-0305e82c3302";

const CURRENT_HANDLER_SET = [
  "catalog_alias_suggestions_refresh",
  "catalog_fuzzy_duplicate_qa_refresh",
  "catalog_match_suggestions_refresh",
  "catalog_typeahead_reindex",
  "journal_entry_index",
  "journal_entry_unindex",
  "stable_registry_edition_build",
  "stable_registry_extension_pack_build",
  "stable_registry_foundation_build",
];

interface Case {
  readonly name: string;
  readonly expect: "accepted" | "refused";
  readonly run: (pool: Pool) => Promise<unknown>;
}

const HEARTBEAT_COLUMNS =
  "queue_name, release_commit_sha, image_digest, schema_compatibility_class, supported_handlers";

function writeHeartbeat(pool: Pool, handlers: (string | null)[]) {
  return pool.query(
    `insert into matching_worker_heartbeats (${HEARTBEAT_COLUMNS})
     values ('matching', $1, $2, 'ove190.matching-schema.v1', $3::text[])
     on conflict (queue_name) do update
       set supported_handlers = excluded.supported_handlers`,
    ["a".repeat(40), `sha256:${"b".repeat(64)}`, handlers],
  );
}

function enqueue(pool: Pool, queueName: string, payload: unknown) {
  return pool.query(
    `insert into job_queue (queue_name, payload) values ($1, $2::jsonb)`,
    [queueName, JSON.stringify(payload)],
  );
}

const CASES: readonly Case[] = [
  {
    name: "0051 records the handler set a current worker writes",
    expect: "accepted",
    run: (pool) => writeHeartbeat(pool, CURRENT_HANDLER_SET),
  },
  {
    // The whole point of 0051: a wrong set has to reach the row, or the worker
    // that has it reads as dead instead of as `capability_mismatch`.
    name: "0051 records a MISMATCHED handler set so it can be classified",
    expect: "accepted",
    run: (pool) =>
      writeHeartbeat(pool, ["journal_entry_index", "journal_entry_unindex"]),
  },
  {
    name: "0051 refuses an empty handler set",
    expect: "refused",
    run: (pool) => writeHeartbeat(pool, []),
  },
  {
    name: "0051 refuses a handler name that is not snake_case",
    expect: "refused",
    run: (pool) =>
      writeHeartbeat(pool, ["journal_entry_index", "Not A Handler"]),
  },
  {
    name: "0051 refuses one element that smuggles two names through a comma",
    expect: "refused",
    run: (pool) =>
      writeHeartbeat(pool, ["journal_entry_index,journal_entry_unindex"]),
  },
  {
    name: "0051 refuses a NULL element",
    expect: "refused",
    run: (pool) => writeHeartbeat(pool, ["journal_entry_index", null]),
  },
  {
    name: "0051 refuses an empty-string element",
    expect: "refused",
    run: (pool) => writeHeartbeat(pool, ["journal_entry_index", ""]),
  },
  {
    name: "0052 accepts a valid stable_registry_edition_build payload",
    expect: "accepted",
    run: (pool) =>
      enqueue(pool, "matching", {
        kind: "stable_registry_edition_build",
        releaseId: UUID_A,
      }),
  },
  {
    name: "0052 refuses stable_registry_edition_build with a non-UUID releaseId",
    expect: "refused",
    run: (pool) =>
      enqueue(pool, "matching", {
        kind: "stable_registry_edition_build",
        releaseId: "not-a-uuid",
      }),
  },
  {
    name: "0052 refuses stable_registry_edition_build carrying an undeclared key",
    expect: "refused",
    run: (pool) =>
      enqueue(pool, "matching", {
        kind: "stable_registry_edition_build",
        releaseId: UUID_A,
        ownerUserId: UUID_B,
      }),
  },
  {
    name: "0052 accepts a valid catalog_typeahead_reindex payload",
    expect: "accepted",
    run: (pool) =>
      enqueue(pool, "matching", { kind: "catalog_typeahead_reindex" }),
  },
  {
    name: "0052 refuses catalog_typeahead_reindex carrying anything else",
    expect: "refused",
    run: (pool) =>
      enqueue(pool, "matching", {
        kind: "catalog_typeahead_reindex",
        locale: "uk",
      }),
  },
  {
    name: "0052 accepts a valid erasure_media_object_delete payload",
    expect: "accepted",
    run: (pool) =>
      enqueue(pool, "erasure", {
        kind: "erasure_media_object_delete",
        requestId: "req-1",
        bucket: "media",
        objectKey: "a/b.webp",
      }),
  },
  {
    name: "0052 refuses erasure_media_object_delete missing objectKey",
    expect: "refused",
    run: (pool) =>
      enqueue(pool, "erasure", {
        kind: "erasure_media_object_delete",
        requestId: "req-2",
        bucket: "media",
      }),
  },
  {
    name: "0052 accepts media_derivative_revoke without its optional key",
    expect: "accepted",
    run: (pool) =>
      enqueue(pool, "media_lifecycle", {
        kind: "media_derivative_revoke",
        mediaAssetId: UUID_A,
        bucket: "media",
        objectKey: "a/b.webp",
        reason: "entry_deleted",
      }),
  },
  {
    name: "0052 accepts media_derivative_revoke with its optional key",
    expect: "accepted",
    run: (pool) =>
      enqueue(pool, "media_lifecycle", {
        kind: "media_derivative_revoke",
        mediaAssetId: UUID_A,
        bucket: "media",
        objectKey: "a/c.webp",
        reason: "entry_deleted",
        journalEntryId: UUID_B,
      }),
  },
  {
    name: "0052 refuses media_derivative_revoke with a non-UUID optional key",
    expect: "refused",
    run: (pool) =>
      enqueue(pool, "media_lifecycle", {
        kind: "media_derivative_revoke",
        mediaAssetId: UUID_A,
        bucket: "media",
        objectKey: "a/d.webp",
        reason: "entry_deleted",
        journalEntryId: "nope",
      }),
  },
  {
    // Each constraint is scoped to its own kind, so none of them may start
    // policing a payload it was never given a contract for.
    name: "0052 leaves an unrelated kind alone",
    expect: "accepted",
    run: (pool) =>
      enqueue(pool, "matching", { kind: "some_other_kind", anything: true }),
  },
];

/** The two tables the constraints under test read, and nothing else. */
const MINIMAL_SCHEMA = `
  create table job_queue (
    id bigserial primary key,
    queue_name text not null,
    payload jsonb not null,
    status text not null default 'pending'
  );

  create table matching_worker_heartbeats (
    queue_name text primary key,
    release_commit_sha text not null,
    image_digest text not null,
    schema_compatibility_class text not null,
    supported_handlers text[] not null,
    seen_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
`;

export async function runJobQueueContractDatabaseProof() {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackLocalRuntimeEnvironment(process.env);

  const disposable = `overgarden_queue_contract_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 1 });

  try {
    await pool.query(MINIMAL_SCHEMA);

    const migrations = (
      await loadVersionedApplicationSql(path.join(process.cwd(), "sql"))
    ).filter((migration) => CONTRACT_MIGRATIONS.test(migration.name));
    if (migrations.length !== 3) {
      throw new Error("job_queue_contract_migrations_missing");
    }
    for (const migration of migrations) {
      await pool.query(migration.sql);
    }

    const failures: string[] = [];
    for (const testCase of CASES) {
      const observed = await testCase
        .run(pool)
        .then(() => "accepted" as const)
        .catch((error: unknown) =>
          // 23514 is check_violation. Any other failure is a broken proof, not
          // a refused row, and must not read as a pass.
          error instanceof Error && "code" in error && error.code === "23514"
            ? ("refused" as const)
            : (`error:${(error as { code?: string }).code ?? "unknown"}` as const),
        );
      if (observed !== testCase.expect) {
        failures.push(
          `${testCase.name}: expected ${testCase.expect}, got ${observed}`,
        );
      }
    }

    return {
      schemaVersion: "overgarden.jobQueueContractDatabaseProof.v1",
      status: failures.length === 0 ? "pass" : "fail",
      migrations: migrations.map((migration) => migration.name),
      caseCount: CASES.length,
      failures,
    };
  } finally {
    await pool.end().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

async function main() {
  const receipt = await runJobQueueContractDatabaseProof();
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.status !== "pass") process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "job queue contract proof failed",
  );
  process.exitCode = 1;
});
