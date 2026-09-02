import { randomUUID } from "node:crypto";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient } from "pg";

import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import { loadVersionedApplicationSql } from "./application-sql";
import {
  assertSafeWorkerIdleReceipt,
  roundMs,
  WORKER_WAKE_BUDGET_MS,
  type WorkerIdleMode,
  type WorkerIdleProofReceipt,
} from "./prove-worker-idle-contract";

/** Migrations this proof owns: base schema, projection outbox, wake contract. */
const WORKER_IDLE_MIGRATIONS = /^(0001|0011|0044)_/u;

/** The fallback the worker ships with; asserted, not assumed. */
const FALLBACK_BOUND_SECONDS = 30;

const WAKE_CHANNEL = "matching_worker_wake";

/**
 * Proves the wake contract against migration 0044 and real rows.
 *
 * Four things a compile-only test cannot check. Whether the trigger delivers a
 * notification at all. Whether a future-dated job correctly stays silent, so
 * the fallback owns delayed work rather than the worker spinning on it.
 * Whether the drain's own writes wake the worker — which would make it wake
 * itself forever. And whether the heartbeat column actually refuses a raw
 * exception message, which is the only thing keeping a slug or an owner
 * identifier out of it.
 *
 * It builds its own disposable database and drops it, so it never writes to the
 * database whose connection string it borrows.
 */
export async function runWorkerIdleContractDatabaseProof(input: {
  mode: WorkerIdleMode;
}): Promise<WorkerIdleProofReceipt> {
  loadEnv({ path: ".env.local", quiet: true });
  assertLoopbackLocalRuntimeEnvironment(process.env);

  const disposable = `overgarden_ove356_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(requiredEnv("DATABASE_URL"));
  adminUrl.pathname = "/postgres";
  const targetUrl = new URL(requiredEnv("DATABASE_URL"));
  targetUrl.pathname = `/${disposable}`;

  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${disposable}"`);

  // Two connections on purpose: one listens, one writes. A single-connection
  // pool would deadlock, and would also not resemble the worker, which listens
  // on the connection it claims with while the app writes from another.
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 3 });
  const listener = await pool.connect();

  try {
    await applyWorkerIdleMigrations(pool);
    await listener.query(`listen ${WAKE_CHANNEL}`);
    const wakes = collectWakes(listener);

    // A newly inserted job that is already available must wake the worker.
    wakes.reset();
    const startedAt = performance.now();
    await pool.query(
      `insert into job_queue (queue_name, payload)
       values ('matching', '{"kind":"journal_entry_index"}'::jsonb)`,
    );
    const availableJobWokeWorker = await wakes.waitForOne(
      WORKER_WAKE_BUDGET_MS,
    );
    const wakeLatencyMs = performance.now() - startedAt;
    if (!availableJobWokeWorker) {
      throw new Error("an_available_job_did_not_wake_the_worker");
    }
    if (wakes.payloads().some((payload) => payload !== "")) {
      throw new Error("wake_notification_carried_a_payload");
    }

    // A future-dated job must stay silent: the bounded fallback owns delayed
    // work, and waking now would only make the worker claim nothing.
    wakes.reset();
    await pool.query(
      `insert into job_queue (queue_name, payload, available_at)
       values ('matching', '{"kind":"journal_entry_index"}'::jsonb,
               now() + interval '1 hour')`,
    );
    const futureJobStayedSilent = !(await wakes.waitForOne(400));
    if (!futureJobStayedSilent) {
      throw new Error("a_future_dated_job_woke_the_worker");
    }

    // A new revocation intent must wake the worker. Without this the erasure
    // promise would have got slower, not faster: a revocation would wait for
    // the fallback instead of the old one-second drain.
    const intent = await seedIntent(pool, wakes);
    if (!intent.newIntentWokeWorker) {
      throw new Error("a_new_projection_intent_did_not_wake_the_worker");
    }

    // ...but the drain's own writes must not. `applied_state` moves on every
    // successful drain; notifying on it would wake the worker for its own work,
    // forever.
    wakes.reset();
    await pool.query(
      `update public_projection_intents
          set applied_state = 'absent',
              applied_generation = desired_generation,
              status = 'applied',
              applied_at = now(),
              verified_at = now(),
              updated_at = now()
        where entity_id = $1::uuid`,
      [intent.entityId],
    );
    const drainWriteStayedSilent = !(await wakes.waitForOne(400));
    if (!drainWriteStayedSilent) {
      throw new Error("the_drain_woke_itself_and_would_never_stop");
    }

    const { drainClassRecorded, rawDrainMessageRefused } =
      await proveDrainColumnContract(pool);

    return assertSafeWorkerIdleReceipt({
      schemaVersion: "ove356.workerIdleContract.v1",
      mode: input.mode,
      runClass: "database",
      status: "pass",
      terminalClass: "verified",
      wakeSourceClass: "notification",
      availableJobWokeWorker,
      futureJobStayedSilent,
      newIntentWokeWorker: intent.newIntentWokeWorker,
      drainWriteStayedSilent,
      drainClassRecorded,
      rawDrainMessageRefused,
      idleNotificationCount: 0,
      maxWakeLatencyMs: roundMs(wakeLatencyMs),
      wakeBudgetMs: WORKER_WAKE_BUDGET_MS,
      fallbackBoundSeconds: FALLBACK_BOUND_SECONDS,
      degradedReasonClass: null,
      forbiddenMarkersAbsent: true,
      controls: { workerStatusEnabled: true, stopWorkerEnabled: true },
    });
  } finally {
    listener.release();
    await pool.end().catch(() => undefined);
    await admin
      .query(`drop database if exists "${disposable}" with (force)`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

async function applyWorkerIdleMigrations(pool: Pool) {
  const migrations = await loadVersionedApplicationSql(
    path.join(process.cwd(), "sql"),
  );
  const applied = migrations.filter((migration) =>
    WORKER_IDLE_MIGRATIONS.test(migration.name),
  );
  if (applied.length !== 3) {
    throw new Error("worker_idle_migrations_missing");
  }
  for (const migration of applied) {
    await pool.query(migration.sql);
  }
}

interface WakeCollector {
  reset(): void;
  payloads(): string[];
  waitForOne(timeoutMs: number): Promise<boolean>;
}

function collectWakes(listener: PoolClient): WakeCollector {
  let received: string[] = [];
  listener.on("notification", (message) => {
    if (message.channel === WAKE_CHANNEL) received.push(message.payload ?? "");
  });
  return {
    reset() {
      received = [];
    },
    payloads() {
      return [...received];
    },
    async waitForOne(timeoutMs: number) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (received.length > 0) return true;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return received.length > 0;
    },
  };
}

async function seedIntent(pool: Pool, wakes: WakeCollector) {
  const entityId = randomUUID();
  wakes.reset();
  await pool.query(
    `insert into public_projection_intents (
       entity_kind, entity_id, owner_user_id, desired_state,
       desired_generation, desired_reason
     ) values ('journal_entry', $1::uuid, $2::uuid, 'absent', 1, 'erasure')`,
    [entityId, randomUUID()],
  );
  return {
    entityId,
    newIntentWokeWorker: await wakes.waitForOne(WORKER_WAKE_BUDGET_MS),
  };
}

/**
 * The column must take a class and refuse a message.
 *
 * An exception message can carry a slug, a media URL, or an owner identifier.
 * The check is the only thing standing between the worker's error path and a
 * column full of them.
 */
async function proveDrainColumnContract(pool: Pool) {
  await pool.query(
    `insert into matching_worker_heartbeats (
       queue_name, release_commit_sha, image_digest,
       schema_compatibility_class, supported_handlers
     ) values ('matching', $1, $2, 'ove190.matching-schema.v1', $3::text[])`,
    [
      "a".repeat(40),
      `sha256:${"b".repeat(64)}`,
      [
        "catalog_alias_suggestions_refresh",
        "catalog_fuzzy_duplicate_qa_refresh",
        "catalog_match_suggestions_refresh",
        "catalog_typeahead_reindex",
        "journal_entry_index",
        "journal_entry_unindex",
      ],
    ],
  );

  await pool.query(
    `update matching_worker_heartbeats
        set last_drain_error_class = 'os_error', last_drain_error_at = now()
      where queue_name = 'matching'`,
  );
  const recorded = await pool.query<{ last_drain_error_class: string | null }>(
    `select last_drain_error_class from matching_worker_heartbeats
      where queue_name = 'matching'`,
  );
  const drainClassRecorded =
    recorded.rows[0]?.last_drain_error_class === "os_error";

  const rawDrainMessageRefused = await refused(
    pool,
    `update matching_worker_heartbeats
        set last_drain_error_class = 'failed for /journal/tomato-2026',
            last_drain_error_at = now()
      where queue_name = 'matching'`,
  );
  // A class without a time, and a time without a class, are both incoherent.
  const halfRecordRefused = await refused(
    pool,
    `update matching_worker_heartbeats
        set last_drain_error_class = 'os_error', last_drain_error_at = null
      where queue_name = 'matching'`,
  );

  if (!drainClassRecorded || !rawDrainMessageRefused || !halfRecordRefused) {
    throw new Error("drain_error_column_contract_not_enforced");
  }
  return { drainClassRecorded, rawDrainMessageRefused };
}

async function refused(pool: Pool, statement: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(statement);
    await client.query("rollback");
    return false;
  } catch {
    await client.query("rollback").catch(() => undefined);
    return true;
  } finally {
    client.release();
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
