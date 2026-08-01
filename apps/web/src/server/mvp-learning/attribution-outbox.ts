import "server-only";

import { randomUUID } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import {
  actorClassFromPilotCohort,
  type ActorClass,
} from "@/lib/garden/actor-class";
import {
  isPilotInviteCohort,
  type PilotInviteCohort,
} from "@/lib/garden/pilot-invite";
import { isPilotSegment, type PilotSegment } from "@/lib/pilot/segments";
import {
  getLearningActorAttribution,
  upsertLearningActorAttribution,
} from "@/server/learning-actor-attribution";
import {
  buildGetPilotInviteGrantQuery,
  buildGrantPilotWriteAccessQuery,
} from "@/server/pilot-invite-repository";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const LEASE_SECONDS = 180;
const MAX_ATTEMPTS = 8;
export const LEARNING_ATTRIBUTION_OUTBOX_INVOCATION_BUDGET_MS = 45_000;

type AttributionOutboxState = "attributed" | "failed" | "dead" | "cancelled";

interface ClaimedAttributionOutboxRow {
  id: string;
  userId: string;
  cohort: string | null;
  segment: string | null;
  attempts: number;
  desiredGeneration: number;
  leaseToken: string;
  reclaimed: boolean;
}

export interface LearningAttributionOutboxCounts {
  pending: number;
  processing: number;
  failed: number;
  dead: number;
  attributed: number;
  cancelled: number;
}

export interface LearningAttributionOutboxDrainResult {
  claimed: number;
  attributed: number;
  failed: number;
  dead: number;
  cancelled: number;
  reclaimed: number;
  remaining: number;
  deadlineReached: boolean;
  durationMs: number;
}

/**
 * Record non-identifying attribution intent in the same transaction as a
 * successful canonical journal mutation. A user has one convergent work item;
 * each canonical write advances its desired generation, while replayed writes
 * never reach this point and a committed entry never relies on a post-commit
 * enqueue.
 */
export async function enqueueLearningAttributionIntent(
  executor: QueryExecutor,
  scope: RequestScope,
): Promise<void> {
  const hint = scope.learningAttributionHint;
  await sql`
    insert into learning_attribution_outbox (
      user_id,
      cohort,
      segment,
      desired_generation,
      applied_generation
    )
    values (
      ${scope.userId},
      ${hint?.cohort ?? null},
      ${hint?.segment ?? null},
      1,
      0
    )
    on conflict (user_id) do update
    set desired_generation = learning_attribution_outbox.desired_generation + 1,
        cohort = coalesce(learning_attribution_outbox.cohort, excluded.cohort),
        segment = coalesce(learning_attribution_outbox.segment, excluded.segment),
        state = case
          when learning_attribution_outbox.state in ('attributed', 'dead', 'cancelled')
            then 'pending'
          else learning_attribution_outbox.state
        end,
        attempts = case
          when learning_attribution_outbox.state in ('attributed', 'dead', 'cancelled')
            then 0
          else learning_attribution_outbox.attempts
        end,
        available_at = case
          when learning_attribution_outbox.state in ('attributed', 'dead', 'cancelled')
            then now()
          else learning_attribution_outbox.available_at
        end,
        locked_at = case
          when learning_attribution_outbox.state in ('attributed', 'dead', 'cancelled')
            then null
          else learning_attribution_outbox.locked_at
        end,
        locked_by = case
          when learning_attribution_outbox.state in ('attributed', 'dead', 'cancelled')
            then null
          else learning_attribution_outbox.locked_by
        end,
        terminalized_at = case
          when learning_attribution_outbox.state in ('attributed', 'dead', 'cancelled')
            then null
          else learning_attribution_outbox.terminalized_at
        end,
        last_error_class = case
          when learning_attribution_outbox.state in ('attributed', 'dead', 'cancelled')
            then null
          else learning_attribution_outbox.last_error_class
        end,
        updated_at = now()
  `.execute(executor);
}

/**
 * Lease and converge durable attribution separately from a journal response.
 * The lease token makes concurrent after()/Cron invocations safe; an expired
 * lease is reclaimed, and failures use bounded exponential retry before an
 * explicit terminal state. No raw invite or request data enters this table.
 */
export async function drainLearningAttributionOutbox(
  limit = 16,
  options: {
    budgetMs?: number;
    now?: () => number;
    outboxIds?: readonly string[];
  } = {},
): Promise<LearningAttributionOutboxDrainResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const budgetMs =
    options.budgetMs ?? LEARNING_ATTRIBUTION_OUTBOX_INVOCATION_BUDGET_MS;
  let claimed = 0;
  let attributed = 0;
  let failed = 0;
  let dead = 0;
  let cancelled = 0;
  let reclaimed = 0;

  for (
    let index = 0;
    index < limit && now() - startedAt < budgetMs;
    index += 1
  ) {
    const claim = await claimNextLearningAttributionOutboxRow(
      options.outboxIds,
    );
    if (!claim) break;
    claimed += 1;
    if (claim.reclaimed) reclaimed += 1;

    const hint = parseAttributionHint(claim);
    if (hint === "invalid") {
      await settleLearningAttributionClaim(claim, "dead", null, "invalid_hint");
      dead += 1;
      continue;
    }

    try {
      const outcome = await db.transaction().execute(async (trx) => {
        const user = await trx
          .selectFrom("user")
          .select("id")
          .where("id", "=", claim.userId)
          .executeTakeFirst();
        if (!user) return "missing_user" as const;

        const durable = await getLearningActorAttribution(claim.userId, trx);
        const attribution =
          durable ?? (await materializeAttribution(trx, claim.userId, hint));
        await backfillActorClassForOwner(
          trx,
          claim.userId,
          attribution.actorClass,
        );
        return "attributed" as const;
      });

      if (outcome === "missing_user") {
        await settleLearningAttributionClaim(claim, "cancelled", null, null);
        cancelled += 1;
      } else {
        await settleLearningAttributionClaim(claim, "attributed", null, null);
        attributed += 1;
      }
    } catch {
      const terminal = claim.attempts >= MAX_ATTEMPTS;
      await settleLearningAttributionClaim(
        claim,
        terminal ? "dead" : "failed",
        terminal ? null : new Date(Date.now() + retryDelayMs(claim.attempts)),
        terminal ? "max_attempts" : "transient",
      );
      if (terminal) dead += 1;
      else failed += 1;
    }
  }

  const remaining = await countUnfinishedLearningAttributionRows(
    options.outboxIds,
  );
  const durationMs = now() - startedAt;
  return {
    claimed,
    attributed,
    failed,
    dead,
    cancelled,
    reclaimed,
    remaining,
    deadlineReached: durationMs >= budgetMs && remaining > 0,
    durationMs,
  };
}

export async function getLearningAttributionOutboxCounts(
  executor: QueryExecutor = db,
): Promise<LearningAttributionOutboxCounts> {
  const rows = await executor
    .selectFrom("learning_attribution_outbox")
    .select(["state", sql<number>`count(*)::int`.as("count")])
    .groupBy("state")
    .execute();
  const counts: LearningAttributionOutboxCounts = {
    pending: 0,
    processing: 0,
    failed: 0,
    dead: 0,
    attributed: 0,
    cancelled: 0,
  };
  for (const row of rows) {
    if (isOutboxState(row.state)) counts[row.state] = countValue(row.count);
  }
  return counts;
}

async function materializeAttribution(
  executor: QueryExecutor,
  userId: string,
  hint: { cohort: PilotInviteCohort; segment: PilotSegment } | null,
) {
  if (hint) {
    await buildGrantPilotWriteAccessQuery(executor, {
      userId,
      cohort: hint.cohort,
      segment: hint.segment,
    }).execute();
  }
  const grant = await buildGetPilotInviteGrantQuery(
    executor,
    userId,
  ).executeTakeFirst();
  const grantCohort = grant?.cohort ?? null;
  if (grantCohort !== null && !isPilotInviteCohort(grantCohort)) {
    throw new Error("Pilot grant has an unsupported cohort.");
  }
  const actorClass = actorClassFromPilotCohort(grantCohort);
  return await upsertLearningActorAttribution(
    {
      userId,
      actorClass,
      source: grant ? "pilot_grant" : "self_serve_default",
    },
    executor,
  );
}

async function backfillActorClassForOwner(
  executor: QueryExecutor,
  userId: string,
  actorClass: ActorClass,
): Promise<void> {
  await sql`
    update analytics_events
    set properties = jsonb_set(
      coalesce(properties, '{}'::jsonb),
      '{actor_class}',
      to_jsonb(${actorClass}::text),
      true
    )
    where owner_user_id = ${userId}
      and (properties ->> 'actor_class' is null or properties ->> 'actor_class' = '')
  `.execute(executor);
}

function parseAttributionHint(
  claim: Pick<ClaimedAttributionOutboxRow, "cohort" | "segment">,
): { cohort: PilotInviteCohort; segment: PilotSegment } | null | "invalid" {
  if (claim.cohort === null && claim.segment === null) return null;
  if (!isPilotInviteCohort(claim.cohort) || !isPilotSegment(claim.segment)) {
    return "invalid";
  }
  return { cohort: claim.cohort, segment: claim.segment };
}

async function claimNextLearningAttributionOutboxRow(
  outboxIds?: readonly string[],
): Promise<ClaimedAttributionOutboxRow | null> {
  const leaseToken = `learning-attribution-outbox:${randomUUID()}`;
  const candidateFilter = outboxIds
    ? outboxIds.length > 0
      ? sql`and id in (${sql.join(outboxIds)})`
      : sql`and false`
    : sql``;
  const result = await sql<{
    id: string;
    user_id: string;
    cohort: string | null;
    segment: string | null;
    attempts: number;
    desired_generation: number;
    previous_state: string;
  }>`
    with next_row as (
      select id, state as previous_state
      from learning_attribution_outbox
      where (
        (state in ('pending', 'failed') and available_at <= now())
        or (state = 'processing' and locked_at < now() - (${LEASE_SECONDS} || ' seconds')::interval)
      )
      ${candidateFilter}
      order by available_at asc, created_at asc
      for update skip locked
      limit 1
    )
    update learning_attribution_outbox as outbox
    set state = 'processing',
        locked_at = now(),
        locked_by = ${leaseToken},
        attempts = outbox.attempts + 1,
        updated_at = now()
    from next_row
    where outbox.id = next_row.id
    returning outbox.id, outbox.user_id, outbox.cohort, outbox.segment,
      outbox.attempts, outbox.desired_generation, next_row.previous_state
  `.execute(db);
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        cohort: row.cohort,
        segment: row.segment,
        attempts: row.attempts,
        desiredGeneration: row.desired_generation,
        leaseToken,
        reclaimed: row.previous_state === "processing",
      }
    : null;
}

async function settleLearningAttributionClaim(
  claim: ClaimedAttributionOutboxRow,
  state: AttributionOutboxState,
  availableAt: Date | null,
  errorClass: "transient" | "invalid_hint" | "max_attempts" | null,
): Promise<void> {
  const terminal =
    state === "attributed" || state === "dead" || state === "cancelled";
  await sql`
    update learning_attribution_outbox
    set state = case
          when desired_generation = ${claim.desiredGeneration} then ${state}
          else 'pending'
        end,
        applied_generation = case
          when ${state} = 'attributed'
            then greatest(applied_generation, ${claim.desiredGeneration})
          else applied_generation
        end,
        locked_at = null,
        locked_by = null,
        available_at = case
          when desired_generation = ${claim.desiredGeneration}
            then coalesce(${availableAt}, available_at)
          else now()
        end,
        terminalized_at = case
          when desired_generation = ${claim.desiredGeneration} and ${terminal}
            then now()
          else null
        end,
        last_error_class = case
          when desired_generation = ${claim.desiredGeneration}
            then ${errorClass}
          else null
        end,
        updated_at = now()
    where id = ${claim.id}
      and state = 'processing'
      and locked_by = ${claim.leaseToken}
  `.execute(db);
}

async function countUnfinishedLearningAttributionRows(
  outboxIds?: readonly string[],
): Promise<number> {
  const candidateFilter = outboxIds
    ? outboxIds.length > 0
      ? sql`and id in (${sql.join(outboxIds)})`
      : sql`and false`
    : sql``;
  const result = await sql<{ count: string }>`
    select count(*)::text as count
    from learning_attribution_outbox
    where state in ('pending', 'processing', 'failed')
      ${candidateFilter}
  `.execute(db);
  return Number(result.rows[0]?.count ?? "0");
}

function retryDelayMs(attempts: number): number {
  return Math.min(300, 2 ** Math.min(attempts, 6)) * 1000;
}

function isOutboxState(
  value: string,
): value is keyof LearningAttributionOutboxCounts {
  return [
    "pending",
    "processing",
    "failed",
    "dead",
    "attributed",
    "cancelled",
  ].includes(value);
}

function countValue(
  value: string | number | bigint | null | undefined,
): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
