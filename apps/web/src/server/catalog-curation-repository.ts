import "server-only";

import {
  sql,
  type InsertQueryBuilder,
  type InsertResult,
  type Kysely,
  type Transaction,
} from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const MATCHING_QUEUE = "matching";
const CATALOG_RECONCILE_KIND = "catalog_reconcile";
const CATALOG_CURATION_APPLY_KIND = "catalog_curation_apply";
const CATALOG_THRESHOLD_RECALIBRATE_KIND = "catalog_threshold_recalibrate";

export type CatalogReconcileScope = "labels" | "source_records" | "duplicates";

/**
 * The curation decisions of ADR-0026 D4–D6 are two SQL functions from
 * migration 0056; this module is their only TypeScript caller and holds no
 * second implementation. The worker applies automatically above a rule's
 * threshold; the owner's page (the next task) applies and reverts through
 * the same functions, so the two paths cannot drift.
 */
export async function applyCatalogQueueItem(
  input: { queueItemId: string; actorUserId: string | null; automatic: boolean },
  executor: QueryExecutor = db,
): Promise<{ actionId: string }> {
  const result = await sql<{ action_id: string }>`
    select catalog_apply_queue_item(
      ${input.queueItemId}::uuid,
      ${input.actorUserId}::uuid,
      ${input.automatic}
    ) as action_id
  `.execute(executor);
  const row = result.rows[0];
  if (!row) throw new Error("catalog_apply_queue_item returned no action");
  return { actionId: row.action_id };
}

export async function revertCatalogAction(
  input: { actionId: string; actorUserId: string | null },
  executor: QueryExecutor = db,
): Promise<{ revertActionId: string }> {
  const result = await sql<{ revert_id: string }>`
    select catalog_revert_action(${input.actionId}::uuid, ${input.actorUserId}::uuid) as revert_id
  `.execute(executor);
  const row = result.rows[0];
  if (!row) throw new Error("catalog_revert_action returned no action");
  return { revertActionId: row.revert_id };
}

/**
 * Each builder spells its own payload and its own insert. A shared enqueue
 * helper would hide the kind from the producer/consumer guard, which reads
 * the `const payload` beside an `insertInto("job_queue")`, and a kind it
 * cannot see is a kind nothing holds to a tested consumer.
 */

/** One reconciliation run per scope and source at a time. */
export function buildEnqueueCatalogReconcileJobQuery(
  executor: QueryExecutor,
  input: { scope: CatalogReconcileScope; sourceSlug?: string | null; since?: Date | null },
) {
  const payload = {
    kind: CATALOG_RECONCILE_KIND,
    scope: input.scope,
    ...(input.sourceSlug ? { source_slug: input.sourceSlug } : {}),
    ...(input.since ? { since: input.since.toISOString() } : {}),
  };
  return idempotentEnqueue(
    executor.insertInto("job_queue").values({
      queue_name: MATCHING_QUEUE,
      payload,
      idempotency_key: `matching:${CATALOG_RECONCILE_KIND}:${input.scope}:${input.sourceSlug ?? "all"}`,
    }),
  );
}

/** One apply per queue item; a repeat before the worker claims it is the same row. */
export function buildEnqueueCatalogCurationApplyJobQuery(
  executor: QueryExecutor,
  queueItemId: string,
) {
  const payload = { kind: CATALOG_CURATION_APPLY_KIND, queue_item_id: queueItemId };
  return idempotentEnqueue(
    executor.insertInto("job_queue").values({
      queue_name: MATCHING_QUEUE,
      payload,
      idempotency_key: `matching:${CATALOG_CURATION_APPLY_KIND}:${queueItemId}`,
    }),
  );
}

/** The nightly recalibration; kind-only, one row. */
export function buildEnqueueCatalogThresholdRecalibrateJobQuery(
  executor: QueryExecutor,
) {
  const payload = { kind: CATALOG_THRESHOLD_RECALIBRATE_KIND };
  return idempotentEnqueue(
    executor.insertInto("job_queue").values({
      queue_name: MATCHING_QUEUE,
      payload,
      idempotency_key: `matching:${CATALOG_THRESHOLD_RECALIBRATE_KIND}`,
    }),
  );
}

type JobQueueInsert = InsertQueryBuilder<Database, "job_queue", InsertResult>;

/** A pending duplicate is refreshed; one already processing is asked to rerun. */
function idempotentEnqueue(query: JobQueueInsert) {
  const now = new Date();
  return query
    .onConflict((oc) =>
      oc
        .column("idempotency_key")
        .where("idempotency_key", "is not", null)
        .doUpdateSet({
          status: sql<string>`case
            when job_queue.status = 'processing' then job_queue.status
            else 'pending'
          end`,
          available_at: now,
          locked_at: sql<Date | null>`case
            when job_queue.status = 'processing' then job_queue.locked_at
            else null
          end`,
          locked_by: sql<string | null>`case
            when job_queue.status = 'processing' then job_queue.locked_by
            else null
          end`,
          rerun_requested: sql<boolean>`(job_queue.status = 'processing')`,
          last_error: null,
          updated_at: now,
        }),
    )
    .returning(["id", "status"]);
}
