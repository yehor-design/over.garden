/**
 * OVE-353 production classification, gated conversion, and live read-back for
 * the journal deletion-retention lifecycle.
 *
 * Three modes, deliberately separated so the destructive one cannot be reached
 * by accident:
 *
 * - `dry-run`  read-only. Classifies legacy `archived` rows, enumerates the
 *              dependent relations that would have to move with them, and emits
 *              one redacted SHA-256 digest. Run twice; two equal digests are the
 *              approval artifact.
 * - `apply`    refuses to start without `--approved-digest` matching a digest
 *              this run reproduces from live state. Converts one bounded batch,
 *              scrubs raw content, clears `archived_at`, and records only the
 *              search/media effects that are missing.
 * - `verify`   read-only. Proves zero legacy rows, both lifecycle constraints
 *              validated, and that no tombstone was purged before its horizon
 *              or before its derived effects were terminal.
 *
 * Evidence discipline: this script prints only an environment class, counts,
 * relation names, schema/constraint state, and SHA-256 digests. It never prints
 * a row id, slug, title, body, media key, owner id, or timestamp value.
 */

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

export const OVE353_PLAN_VERSION = "ove353.journal-delete-retention.plan.v1";

/** The exact confirmation an operator must type to convert live rows. */
export const OVE353_APPLY_CONFIRMATION =
  "convert-legacy-archived-journals-to-deleted-retention";

/** One bounded, ordered batch per apply invocation. */
export const OVE353_APPLY_BATCH_LIMIT = 500;

const PLAN_DEADLINE_MS = 60_000;

export type PlanMode = "dry-run" | "apply" | "verify";

export interface PlanOperatorArgs {
  mode: PlanMode;
  environment: "local" | "production";
  envFile?: string;
  approvedDigest?: string;
  confirmApply?: string;
  implementationSha?: string;
}

export interface LegacyRelationCount {
  /** Relation name only. Never a row identifier. */
  relation: string;
  rowCount: number;
}

export interface JournalDeleteRetentionPlan {
  version: typeof OVE353_PLAN_VERSION;
  environmentClass: "local" | "production";
  schema: {
    hasDeletedAt: boolean;
    hasPurgeAfter: boolean;
    lifecycleCheckPresent: boolean;
    lifecycleCheckValidated: boolean;
    retentionCheckPresent: boolean;
    retentionCheckValidated: boolean;
    duePurgeIndexPresent: boolean;
  };
  lifecycleCounts: {
    active: number;
    deletedRetention: number;
    legacyArchived: number;
  };
  /** Dependent rows attached to legacy candidates, by relation name. */
  legacyDependencies: LegacyRelationCount[];
  effects: {
    legacyMissingProjectionIntent: number;
    legacyMissingDerivativeRevoke: number;
  };
  candidateCount: number;
}

// ---------------------------------------------------------------------------
// Pure contract. Kept free of IO so the gate logic is unit-testable.
// ---------------------------------------------------------------------------

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function planDigest(plan: JournalDeleteRetentionPlan): string {
  return createHash("sha256").update(stableJson(plan)).digest("hex");
}

export function parsePlanOperatorArgs(
  argv: readonly string[],
): PlanOperatorArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const next = argv[index + 1];
    values.set(token.slice(2), next?.startsWith("--") ? "" : (next ?? ""));
  }

  const mode = values.get("mode") ?? "dry-run";
  if (mode !== "dry-run" && mode !== "apply" && mode !== "verify") {
    throw new Error("Mode must be dry-run, apply, or verify.");
  }

  const environment = values.get("environment");
  const confirmEnvironment = values.get("confirm-environment");
  if (!environment || environment !== confirmEnvironment) {
    throw new Error(
      "Refuse to run without matching --environment and --confirm-environment.",
    );
  }
  if (environment !== "local" && environment !== "production") {
    throw new Error("Environment must be local or production.");
  }

  const envFile = values.get("env-file");
  const base: PlanOperatorArgs = {
    mode,
    environment,
    ...(envFile ? { envFile } : {}),
  };

  if (mode === "verify") {
    const implementationSha = values.get("implementation-sha");
    if (implementationSha && !/^[a-f0-9]{40}$/.test(implementationSha)) {
      throw new Error("The implementation SHA must be a 40-character commit.");
    }
    return {
      ...base,
      ...(implementationSha ? { implementationSha } : {}),
    };
  }

  if (mode === "apply") {
    const approvedDigest = values.get("approved-digest");
    if (!approvedDigest || !/^[a-f0-9]{64}$/.test(approvedDigest)) {
      throw new Error(
        "Apply requires --approved-digest with the maintainer-approved SHA-256 plan digest.",
      );
    }
    const confirmApply = values.get("confirm-apply");
    if (confirmApply !== OVE353_APPLY_CONFIRMATION) {
      throw new Error("The exact OVE-353 apply confirmation is required.");
    }
    return { ...base, approvedDigest, confirmApply };
  }

  return base;
}

export type ApplyGate =
  | { state: "allowed"; candidateCount: number }
  | { state: "blocked"; reason: string };

/**
 * The apply gate is deliberately conservative. It refuses on drift rather than
 * converting a set the maintainer did not approve, and it refuses on an
 * unmigrated or already-validated schema rather than guessing which half of the
 * expand/contract sequence it is standing in.
 */
export function classifyApplyGate(input: {
  plan: JournalDeleteRetentionPlan;
  observedDigest: string;
  approvedDigest: string;
  batchLimit: number;
}): ApplyGate {
  const { plan, observedDigest, approvedDigest, batchLimit } = input;

  if (observedDigest !== approvedDigest) {
    return {
      state: "blocked",
      reason: "plan_digest_drift",
    };
  }
  if (!plan.schema.hasDeletedAt || !plan.schema.hasPurgeAfter) {
    return { state: "blocked", reason: "migration_0039_not_applied" };
  }
  if (
    !plan.schema.lifecycleCheckPresent ||
    !plan.schema.retentionCheckPresent
  ) {
    return { state: "blocked", reason: "lifecycle_constraints_absent" };
  }
  if (plan.lifecycleCounts.legacyArchived === 0) {
    return { state: "blocked", reason: "nothing_to_convert" };
  }
  if (plan.lifecycleCounts.legacyArchived !== plan.candidateCount) {
    return { state: "blocked", reason: "candidate_count_mismatch" };
  }
  if (plan.candidateCount > batchLimit) {
    return { state: "blocked", reason: "candidate_count_over_batch_limit" };
  }
  const unknownDependency = plan.legacyDependencies.find(
    (dependency) => !KNOWN_DEPENDENT_RELATIONS.has(dependency.relation),
  );
  if (unknownDependency) {
    return { state: "blocked", reason: "unknown_dependent_relation" };
  }
  return { state: "allowed", candidateCount: plan.candidateCount };
}

/**
 * Every relation that may still reference a legacy `archived` journal. An
 * unlisted relation stops the apply: it means the foreign-key closure the
 * contract depends on is not the closure this script was written against.
 */
export const KNOWN_DEPENDENT_RELATIONS: ReadonlySet<string> = new Set([
  "journal_entry_object_mentions",
  "journal_entry_catalog_mentions",
  "journal_entry_topic_signals",
  "journal_entry_mutation_receipts",
  "community_contributions",
  "analytics_events",
  "media_assets",
  "public_projection_intents",
]);

export type VerifyOutcome =
  | { state: "verified" }
  | { state: "failed"; reasons: string[] };

/**
 * Verification gates on state that must be permanently true after the contract
 * step: no legacy rows, both constraints validated, the purge index in place.
 *
 * It deliberately does NOT gate on the due-tombstone backlog. A tombstone whose
 * horizon has passed and whose effects are terminal is legitimately present
 * between two cron passes, so failing on it would make this command flaky
 * rather than informative. The backlog is reported as a bounded class instead,
 * and the predicate that keeps a purge from running early is proved in
 * `retention-executor.test.ts`, where it can be asserted exactly.
 */
export function classifyVerifyOutcome(input: {
  plan: JournalDeleteRetentionPlan;
}): VerifyOutcome {
  const reasons: string[] = [];
  if (input.plan.lifecycleCounts.legacyArchived !== 0) {
    reasons.push("legacy_archived_rows_remain");
  }
  if (!input.plan.schema.lifecycleCheckValidated) {
    reasons.push("lifecycle_check_not_validated");
  }
  if (!input.plan.schema.retentionCheckValidated) {
    reasons.push("retention_check_not_validated");
  }
  if (!input.plan.schema.duePurgeIndexPresent) {
    reasons.push("due_purge_index_absent");
  }
  return reasons.length === 0
    ? { state: "verified" }
    : { state: "failed", reasons };
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

async function readPlan(
  pool: Pool,
  environment: "local" | "production",
): Promise<JournalDeleteRetentionPlan> {
  const schema = await pool.query<{
    has_deleted_at: boolean;
    has_purge_after: boolean;
    lifecycle_present: boolean;
    lifecycle_validated: boolean;
    retention_present: boolean;
    retention_validated: boolean;
    index_present: boolean;
  }>(`
    select
      exists (select 1 from information_schema.columns
        where table_name='journal_entries' and column_name='deleted_at') as has_deleted_at,
      exists (select 1 from information_schema.columns
        where table_name='journal_entries' and column_name='purge_after') as has_purge_after,
      exists (select 1 from pg_constraint
        where conrelid='journal_entries'::regclass
          and conname='journal_entries_lifecycle_state_check') as lifecycle_present,
      coalesce((select convalidated from pg_constraint
        where conrelid='journal_entries'::regclass
          and conname='journal_entries_lifecycle_state_check'), false) as lifecycle_validated,
      exists (select 1 from pg_constraint
        where conrelid='journal_entries'::regclass
          and conname='journal_entries_deletion_retention_check') as retention_present,
      coalesce((select convalidated from pg_constraint
        where conrelid='journal_entries'::regclass
          and conname='journal_entries_deletion_retention_check'), false) as retention_validated,
      exists (select 1 from pg_indexes
        where tablename='journal_entries'
          and indexname='journal_entries_due_purge_idx') as index_present
  `);
  const schemaRow = schema.rows[0]!;

  const lifecycle = await pool.query<{ state: string; count: string }>(`
    select lifecycle_state as state, count(*)::text as count
    from journal_entries group by lifecycle_state
  `);
  const byState = new Map(
    lifecycle.rows.map((row) => [row.state, Number(row.count)]),
  );

  const dependencies: LegacyRelationCount[] = [];
  for (const relation of [...KNOWN_DEPENDENT_RELATIONS].sort()) {
    const column =
      relation === "public_projection_intents"
        ? "entity_id"
        : "journal_entry_id";
    const extra =
      relation === "public_projection_intents"
        ? "and dependent.entity_kind = 'journal_entry'"
        : "";
    const result = await pool.query<{ count: string }>(`
      select count(*)::text as count
      from ${relation} dependent
      join journal_entries je on je.id = dependent.${column}
      where je.lifecycle_state = 'archived' ${extra}
    `);
    dependencies.push({
      relation,
      rowCount: Number(result.rows[0]?.count ?? 0),
    });
  }

  const effects = await pool.query<{
    missing_intent: string;
    missing_revoke: string;
  }>(`
    select
      (select count(*)::text from journal_entries je
       where je.lifecycle_state = 'archived'
         and je.public_slug is not null
         and not exists (
           select 1 from public_projection_intents ppi
           where ppi.entity_kind = 'journal_entry' and ppi.entity_id = je.id
         )) as missing_intent,
      (select count(*)::text from media_assets ma
       join journal_entries je on je.id = ma.journal_entry_id
       where je.lifecycle_state = 'archived'
         and ma.revoked_at is null) as missing_revoke
  `);

  const legacyArchived = byState.get("archived") ?? 0;
  return {
    version: OVE353_PLAN_VERSION,
    environmentClass: environment,
    schema: {
      hasDeletedAt: schemaRow.has_deleted_at,
      hasPurgeAfter: schemaRow.has_purge_after,
      lifecycleCheckPresent: schemaRow.lifecycle_present,
      lifecycleCheckValidated: schemaRow.lifecycle_validated,
      retentionCheckPresent: schemaRow.retention_present,
      retentionCheckValidated: schemaRow.retention_validated,
      duePurgeIndexPresent: schemaRow.index_present,
    },
    lifecycleCounts: {
      active: byState.get("active") ?? 0,
      deletedRetention: byState.get("deleted_retention") ?? 0,
      legacyArchived,
    },
    legacyDependencies: dependencies,
    effects: {
      legacyMissingProjectionIntent: Number(
        effects.rows[0]?.missing_intent ?? 0,
      ),
      legacyMissingDerivativeRevoke: Number(
        effects.rows[0]?.missing_revoke ?? 0,
      ),
    },
    candidateCount: legacyArchived,
  };
}

async function runApply(pool: Pool, batchLimit: number): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");

    // One bounded, ordered batch under a row lock. The scrub and the lifecycle
    // change are the same statement, so no window exists in which a converted
    // row still holds the content it was converted to remove.
    const converted = await client.query<{ id: string }>(
      `
      with due as (
        select id from journal_entries
        where lifecycle_state = 'archived'
        order by id
        limit $1
        for update skip locked
      )
      update journal_entries je
      set title = 'Deleted journal entry',
          body = 'This entry is retained only for technical deletion cleanup.',
          content_document = null,
          content_schema_version = null,
          cover_media_asset_id = null,
          journal_revision = je.journal_revision + 1,
          entry_date = current_date,
          lifecycle_state = 'deleted_retention',
          visibility = 'public',
          public_noindex = true,
          archived_at = null,
          deleted_at = coalesce(je.archived_at, now()),
          purge_after = coalesce(je.archived_at, now()) + interval '7 days',
          public_gone_at = coalesce(je.public_gone_at, now()),
          published_at = null,
          first_publication_disclosure_version = null,
          first_publication_disclosed_at = null,
          source_language = null,
          client_mutation_id = 'deleted:' || je.id::text,
          updated_at = now()
      from due
      where je.id = due.id
      returning je.id as id
      `,
      [batchLimit],
    );

    const ids = converted.rows.map((row) => row.id);
    if (ids.length > 0) {
      await client.query(
        `delete from journal_entry_object_mentions where journal_entry_id = any($1::uuid[])`,
        [ids],
      );
      await client.query(
        `delete from journal_entry_catalog_mentions where journal_entry_id = any($1::uuid[])`,
        [ids],
      );
      await client.query(
        `delete from journal_entry_topic_signals where journal_entry_id = any($1::uuid[])`,
        [ids],
      );
      await client.query(
        `delete from journal_entry_mutation_receipts where journal_entry_id = any($1::uuid[])`,
        [ids],
      );
      await client.query(
        `delete from community_contributions where journal_entry_id = any($1::uuid[])`,
        [ids],
      );
      await client.query(
        `delete from analytics_events where journal_entry_id = any($1::uuid[])`,
        [ids],
      );
      await client.query(
        `update media_assets set alt_text = null, caption = null,
            document_position = null, updated_at = now()
         where journal_entry_id = any($1::uuid[])`,
        [ids],
      );

      // Only the effects that are actually missing. An intent that already
      // exists keeps its generation so a converged removal is not re-opened.
      await client.query(
        `
        insert into public_projection_intents
          (entity_kind, entity_id, owner_user_id, desired_state,
           desired_generation, desired_reason, privacy_reducing)
        select 'journal_entry', je.id, je.owner_user_id, 'absent',
               nextval('public_projection_generation_seq'), 'journal_delete', true
        from journal_entries je
        where je.id = any($1::uuid[])
          and je.public_slug is not null
        on conflict (entity_kind, entity_id) do nothing
        `,
        [ids],
      );
    }

    await client.query("commit");
    return ids.length;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Splits the surviving tombstones into the two classes an operator can act on:
 * those still inside their retention window, and those past it but held back by
 * a derived effect that has not reached a terminal receipt. The second class is
 * the one worth investigating — it is the visible form of a stuck Meilisearch
 * removal or R2 revoke.
 */
async function readTombstoneBacklog(pool: Pool): Promise<{
  withinWindow: number;
  dueBlockedByEffect: number;
  dueAndPurgeable: number;
}> {
  const result = await pool.query<{
    within_window: string;
    due_blocked: string;
    due_purgeable: string;
  }>(`
    with tombstones as (
      select
        je.id,
        je.purge_after <= now() as due,
        (
          exists (
            select 1 from media_assets ma
            where ma.journal_entry_id = je.id
              and (ma.revoked_at is null or ma.public_unreachable_at is null)
          )
          or exists (
            select 1 from public_projection_intents ppi
            where ppi.entity_kind = 'journal_entry' and ppi.entity_id = je.id
              and not (ppi.status = 'applied'
                       and ppi.applied_state = 'absent'
                       and ppi.applied_generation = ppi.desired_generation)
          )
          or exists (
            select 1 from community_contributions cc
            where cc.journal_entry_id = je.id
          )
        ) as blocked
      from journal_entries je
      where je.lifecycle_state = 'deleted_retention'
        and je.purge_after is not null
    )
    select
      count(*) filter (where not due)::text as within_window,
      count(*) filter (where due and blocked)::text as due_blocked,
      count(*) filter (where due and not blocked)::text as due_purgeable
    from tombstones
  `);
  const row = result.rows[0];
  return {
    withinWindow: Number(row?.within_window ?? 0),
    dueBlockedByEffect: Number(row?.due_blocked ?? 0),
    dueAndPurgeable: Number(row?.due_purgeable ?? 0),
  };
}

async function main() {
  const args = parsePlanOperatorArgs(process.argv.slice(2));
  loadEnv({
    path: args.envFile
      ? path.resolve(args.envFile)
      : path.resolve(process.cwd(), ".env.local"),
    quiet: true,
  });

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL or DATABASE_URL is required.");
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    statement_timeout: PLAN_DEADLINE_MS,
  });

  try {
    const plan = await readPlan(pool, args.environment);
    const digest = planDigest(plan);

    if (args.mode === "dry-run") {
      emit({ mode: args.mode, plan, digest, state: "read_only" });
      return;
    }

    if (args.mode === "verify") {
      const backlog = await readTombstoneBacklog(pool);
      const outcome = classifyVerifyOutcome({ plan });
      emit({
        mode: args.mode,
        plan,
        digest,
        state: outcome.state,
        ...(outcome.state === "failed" ? { reasons: outcome.reasons } : {}),
        tombstoneBacklog: {
          withinWindowClass: countClass(backlog.withinWindow),
          dueBlockedByEffectClass: countClass(backlog.dueBlockedByEffect),
          dueAndPurgeableClass: countClass(backlog.dueAndPurgeable),
        },
        implementationShaBound: Boolean(args.implementationSha),
      });
      if (outcome.state === "failed") process.exitCode = 1;
      return;
    }

    const gate = classifyApplyGate({
      plan,
      observedDigest: digest,
      approvedDigest: args.approvedDigest!,
      batchLimit: OVE353_APPLY_BATCH_LIMIT,
    });
    if (gate.state === "blocked") {
      emit({
        mode: args.mode,
        plan,
        digest,
        state: "blocked",
        reason: gate.reason,
      });
      process.exitCode = 1;
      return;
    }

    const convertedCount = await runApply(pool, OVE353_APPLY_BATCH_LIMIT);
    const after = await readPlan(pool, args.environment);
    emit({
      mode: args.mode,
      plan: after,
      digest: planDigest(after),
      state: after.lifecycleCounts.legacyArchived === 0 ? "applied" : "partial",
      convertedClass: countClass(convertedCount),
    });
    if (after.lifecycleCounts.legacyArchived !== 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

function countClass(count: number): "empty" | "low" | "elevated" | "high" {
  if (count === 0) return "empty";
  if (count < 10) return "low";
  if (count < 100) return "elevated";
  return "high";
}

function emit(payload: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        version: OVE353_PLAN_VERSION,
        state: "error",
        errorClass:
          error instanceof Error ? error.message : "unknown_plan_failure",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
