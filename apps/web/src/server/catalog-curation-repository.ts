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
import type { CurationBlock } from "@/lib/catalog/curation-queue";
import { catalogKindSql } from "@/server/catalog-kind-sql";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const MATCHING_QUEUE = "matching";
const CATALOG_RECONCILE_KIND = "catalog_reconcile";
const CATALOG_CURATION_APPLY_KIND = "catalog_curation_apply";
const CATALOG_THRESHOLD_RECALIBRATE_KIND = "catalog_threshold_recalibrate";
const CATALOG_SOURCE_REFRESH_KIND = "catalog_source_refresh";

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
): Promise<{ actionId: string; subjectCatalogItemIds: string[] }> {
  /**
   * Two statements, not one. A query's snapshot is taken before it runs, so
   * the row the function inserts is invisible to a join in the same
   * statement: the earlier single-statement form applied the decision and
   * then threw "returned no action" every time, which no mocked test could
   * see. The second statement reads what the first one committed.
   */
  const applied = await sql<{ action_id: string }>`
    select catalog_apply_queue_item(
      ${input.queueItemId}::uuid,
      ${input.actorUserId}::uuid,
      ${input.automatic}
    )::text as action_id
  `.execute(executor);
  const actionId = applied.rows[0]?.action_id;
  if (!actionId) throw new Error("catalog_apply_queue_item returned no action");
  return { actionId, subjectCatalogItemIds: await readActionSubjects(actionId, executor) };
}

/**
 * No, with the owner's decision recorded on the item. `changed` is false when
 * the item was no longer open — decided in another tab — so the page can say
 * that rather than claim a decision it did not make (`OVE-506`).
 */
export async function rejectCatalogQueueItem(
  input: { queueItemId: string; actorUserId: string },
  executor: QueryExecutor = db,
): Promise<{ changed: boolean }> {
  const result = await sql`
    update catalog_curation_queue
    set state = 'rejected', decided_by_user_id = ${input.actorUserId}::uuid,
        decided_at = now(), updated_at = now()
    where id = ${input.queueItemId}::uuid and state = 'open'
  `.execute(executor);
  return { changed: Number(result.numAffectedRows ?? 0) > 0 };
}

/** Later: the item leaves the stream without a decision either way. */
export async function skipCatalogQueueItem(
  input: { queueItemId: string; actorUserId: string },
  executor: QueryExecutor = db,
): Promise<{ changed: boolean }> {
  const result = await sql`
    update catalog_curation_queue
    set state = 'skipped', decided_by_user_id = ${input.actorUserId}::uuid,
        decided_at = now(), updated_at = now()
    where id = ${input.queueItemId}::uuid and state = 'open'
  `.execute(executor);
  return { changed: Number(result.numAffectedRows ?? 0) > 0 };
}

export async function revertCatalogAction(
  input: { actionId: string; actorUserId: string | null },
  executor: QueryExecutor = db,
): Promise<{ revertActionId: string; subjectCatalogItemIds: string[] }> {
  const reverted = await sql<{ revert_id: string }>`
    select catalog_revert_action(
      ${input.actionId}::uuid,
      ${input.actorUserId}::uuid
    )::text as revert_id
  `.execute(executor);
  const revertActionId = reverted.rows[0]?.revert_id;
  if (!revertActionId) throw new Error("catalog_revert_action returned no action");
  return {
    revertActionId,
    subjectCatalogItemIds: await readActionSubjects(revertActionId, executor),
  };
}

/** The nodes an action touched, read after the function committed them. */
async function readActionSubjects(
  actionId: string,
  executor: QueryExecutor,
): Promise<string[]> {
  const result = await sql<{ subjects: string[] }>`
    select coalesce(subject_catalog_item_ids::text[], array[]::text[]) as subjects
    from catalog_curation_actions
    where id = ${actionId}::uuid
  `.execute(executor);
  return result.rows[0]?.subjects ?? [];
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

/** One refresh per source at a time; the owner's button lands here. */
export function buildEnqueueCatalogSourceRefreshJobQuery(
  executor: QueryExecutor,
  sourceSlug: string,
) {
  const payload = { kind: CATALOG_SOURCE_REFRESH_KIND, source_slug: sourceSlug };
  return idempotentEnqueue(
    executor.insertInto("job_queue").values({
      queue_name: MATCHING_QUEUE,
      payload,
      idempotency_key: `matching:${CATALOG_SOURCE_REFRESH_KIND}:${sourceSlug}`,
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

/* ------------------------------------------------------------------------ */
/* Reads for the owner's two pages (ADR-0026 D10)                           */
/* ------------------------------------------------------------------------ */

export interface CuratedNodeSummary {
  catalogItemId: string;
  canonicalName: string;
  catalogKind: string;
  nodeKind: string;
  kingdom: string | null;
  rank: string | null;
  publicSlug: string | null;
  speciesSlug: string | null;
  objectCount: number;
  entryCount: number;
  identifiers: { scheme: string; value: string }[];
}

/**
 * Why Accept cannot succeed for an open item, read from the same conditions
 * `catalog_apply_queue_item` refuses on (migration `0056`), or null when it
 * can (`OVE-506`).
 *
 * - `no_target` — nothing to attach to or merge into: a search miss the owner
 *   queued has a name and no card, and a merge needs two distinct nodes;
 * - `target_inactive` — the card it names has since been merged or retired;
 * - `not_applied_here` — a split is reviewed on the card, never applied by
 *   the function.
 *
 * The page used to offer Accept for all of them, and each press ended on the
 * error page. It is not a new rule: it is the function's refusal, said before
 * the press instead of after.
 */
export type { CurationBlock };

export interface CurationQueueItem {
  id: string;
  itemType: "label_link" | "node_merge" | "source_link" | "split_review";
  subjectLabel: string | null;
  confidence: number | null;
  reasons: string[];
  impactScore: number;
  createdAt: Date | string;
  /** What the decision would change, and what it would change it into. */
  subject: CuratedNodeSummary | null;
  target: CuratedNodeSummary | null;
  labelObjectCount: number;
  sourceSlug: string | null;
  blockedBy: CurationBlock | null;
}

export interface AppliedCurationAction {
  actionId: string;
  actionType: string;
  itemType: string | null;
  ruleCode: string | null;
  reasons: string[];
  subjectNames: string[];
  performedAt: Date | string;
  automatic: boolean;
  reverted: boolean;
}

const NODE_SUMMARY_SQL = sql`
  json_build_object(
    'catalogItemId', node.id,
    'canonicalName', node.canonical_name,
    'catalogKind', ${catalogKindSql("node")},
    'nodeKind', node.node_kind,
    'kingdom', node.kingdom,
    'rank', node.rank,
    'publicSlug', node.public_slug,
    'speciesSlug', (
      select parent.public_slug
      from catalog_item_relations as form_relation
      join catalog_items as parent on parent.id = form_relation.to_catalog_item_id
      where form_relation.from_catalog_item_id = node.id
        and form_relation.relation_type = 'form_of'
        and parent.node_kind = 'taxon'
      order by form_relation.created_at, form_relation.id
      limit 1
    ),
    'objectCount', (
      select count(*)::int from plant_objects where plant_objects.catalog_item_id = node.id
    ),
    'entryCount', (
      select count(*)::int
      from journal_entries
      join plant_objects on plant_objects.id = journal_entries.plant_object_id
      where plant_objects.catalog_item_id = node.id
        and journal_entries.lifecycle_state = 'active'
        and journal_entries.deleted_at is null
    ),
    'identifiers', coalesce((
      select json_agg(json_build_object('scheme', identifier.scheme, 'value', identifier.value)
                      order by identifier.scheme, identifier.value)
      from catalog_item_identifiers as identifier
      where identifier.catalog_item_id = node.id
    ), '[]'::json)
  )
`;

/**
 * `CurationBlock`, in SQL: the preconditions `catalog_apply_queue_item`
 * checks before it changes anything, in the same order. A merge names its
 * survivor as `proposal.survivor_id`; a label is linked to
 * `proposal.catalog_item_id`, or failing that to its subject.
 */
const CURATION_BLOCK_SQL = sql`
  case
    when queue.item_type = 'label_link' then (
      case
        when queue.subject_label is null
          or coalesce(
            (queue.proposal->>'catalog_item_id')::uuid,
            queue.subject_catalog_item_id
          ) is null
          then 'no_target'
        when not exists (
          select 1 from catalog_items as apply_target
          where apply_target.id = coalesce(
              (queue.proposal->>'catalog_item_id')::uuid,
              queue.subject_catalog_item_id
            )
            and apply_target.identity_state = 'active'
        ) then 'target_inactive'
      end
    )
    when queue.item_type = 'node_merge' then (
      case
        when queue.subject_catalog_item_id is null
          or queue.proposal->>'survivor_id' is null
          or (queue.proposal->>'survivor_id')::uuid = queue.subject_catalog_item_id
          then 'no_target'
        when (
          select count(*) from catalog_items as merge_node
          where merge_node.id in (
              queue.subject_catalog_item_id,
              (queue.proposal->>'survivor_id')::uuid
            )
            and merge_node.identity_state = 'active'
        ) < 2 then 'target_inactive'
      end
    )
    when queue.item_type = 'source_link' then (
      case
        when queue.subject_catalog_item_id is null
          or queue.proposal->>'source_slug' is null
          or queue.proposal->>'source_snapshot_id' is null
          then 'no_target'
      end
    )
    else 'not_applied_here'
  end
`;

/**
 * The open queue, highest impact first (ADR-0026 D10). One statement: each
 * item carries both sides of the decision, so the page shows two cards
 * without a second round trip per item.
 */
/**
 * The item types the owner decides, and the one that is not a decision.
 *
 * `source_unmatched` is a source record the graph could not place: EPPO knows
 * a genus the catalogue does not model, a register form whose species did not
 * resolve. There is no node to attach it to, so `catalog_apply_queue_item` has
 * nothing to carry out — answering it means creating a node or attaching a
 * form, and neither is a decision this queue can make. It is coverage, and
 * coverage is counted on the sources page rather than asked one at a time.
 *
 * On 2026-09-20 production held 13,450 of them among 13,456 open rows, every
 * one refused by the apply function. The stream is the six that were real.
 */
export const DECIDABLE_CURATION_ITEM_TYPES = [
  "label_link",
  "node_merge",
  "source_link",
  "split_review",
] as const;

export function buildCurationQueueStatement(input: {
  itemType?: string | null;
  limit?: number;
  /** One open decision by id, whatever its rank (`readOpenCurationQueueItem`). */
  itemId?: string | null;
}) {
  const typeFilter = input.itemType
    ? sql`and queue.item_type = ${input.itemType}`
    : sql`and queue.item_type = any(${sql.val(
        DECIDABLE_CURATION_ITEM_TYPES as readonly string[],
      )}::text[])`;
  const itemFilter = input.itemId
    ? sql`and queue.id = ${input.itemId}::uuid`
    : sql``;
  return sql<{
    id: string;
    itemType: CurationQueueItem["itemType"];
    subjectLabel: string | null;
    confidence: string | null;
    reasons: string[];
    impactScore: number;
    createdAt: Date;
    subject: CuratedNodeSummary | null;
    target: CuratedNodeSummary | null;
    labelObjectCount: number;
    sourceSlug: string | null;
    blockedBy: CurationBlock | null;
  }>`
    select
      queue.id,
      queue.item_type as "itemType",
      queue.subject_label as "subjectLabel",
      queue.confidence as "confidence",
      queue.reasons as "reasons",
      queue.impact_score as "impactScore",
      queue.created_at as "createdAt",
      (select ${NODE_SUMMARY_SQL} from catalog_items as node where node.id = queue.subject_catalog_item_id) as "subject",
      (
        select ${NODE_SUMMARY_SQL} from catalog_items as node
        where node.id = coalesce(
          (queue.proposal->>'survivor_id')::uuid,
          (queue.proposal->>'catalog_item_id')::uuid
        )
          and node.id is distinct from queue.subject_catalog_item_id
      ) as "target",
      case
        when queue.subject_label is null then 0
        else (
          select count(*)::int from plant_objects
          where plant_objects.variety_state = 'free_text'
            and plant_objects.catalog_item_id is null
            and plant_objects.variety_text is not null
            and catalog_normalize_name(plant_objects.variety_text)
                = catalog_normalize_name(queue.subject_label)
        )
      end as "labelObjectCount",
      queue.proposal->>'source_slug' as "sourceSlug",
      ${CURATION_BLOCK_SQL} as "blockedBy"
    from catalog_curation_queue as queue
    where queue.state = 'open'
      ${typeFilter}
      ${itemFilter}
    order by queue.impact_score desc, queue.created_at asc
    limit ${Math.max(1, Math.min(input.limit ?? 20, 100))}
  `;
}

export async function listOpenCurationQueue(
  input: { itemType?: string | null; limit?: number; itemId?: string | null } = {},
  executor: QueryExecutor = db,
): Promise<CurationQueueItem[]> {
  const result = await buildCurationQueueStatement(input).execute(executor);
  return result.rows.map((row) => ({
    id: row.id,
    itemType: row.itemType,
    subjectLabel: row.subjectLabel,
    confidence: row.confidence === null ? null : Number(row.confidence),
    reasons: row.reasons ?? [],
    impactScore: Number(row.impactScore),
    createdAt: row.createdAt,
    subject: row.subject,
    target: row.target,
    labelObjectCount: Number(row.labelObjectCount ?? 0),
    sourceSlug: row.sourceSlug,
    blockedBy: row.blockedBy ?? null,
  }));
}

/**
 * One open decision, whatever its rank (`OVE-506`). The page lists the top
 * twenty; a link to a decision below them — a search miss is queued at impact
 * 1 — used to fall back to the top item, and the owner's next press decided a
 * proposal they had not opened.
 */
export async function readOpenCurationQueueItem(
  queueItemId: string,
  executor: QueryExecutor = db,
): Promise<CurationQueueItem | null> {
  const [item] = await listOpenCurationQueue(
    { itemId: queueItemId, limit: 1 },
    executor,
  );
  return item ?? null;
}

/**
 * One item as the owner last left it, whatever its state — what an outcome
 * notice names after a decision (`OVE-506`). The page reads the state back
 * from the record rather than trusting the redirect that brought it there:
 * "accepted" is said only of an item the database holds as accepted.
 */
export interface CurationQueueItemSummary {
  id: string;
  itemType: string;
  state: string;
  subjectLabel: string | null;
  /** The node a merge folds away — whose objects a confirmation counts. */
  subjectCatalogItemId: string | null;
  subjectName: string | null;
  targetName: string | null;
  /** Who decided it and when — so a decision can recognise itself. */
  decidedByUserId: string | null;
  decidedAt: Date | string | null;
}

export async function readCurationQueueItemSummary(
  queueItemId: string,
  executor: QueryExecutor = db,
): Promise<CurationQueueItemSummary | null> {
  const result = await sql<CurationQueueItemSummary>`
    select
      queue.id::text as id,
      queue.item_type as "itemType",
      queue.state as state,
      queue.subject_label as "subjectLabel",
      queue.subject_catalog_item_id::text as "subjectCatalogItemId",
      (select node.canonical_name from catalog_items as node
        where node.id = queue.subject_catalog_item_id) as "subjectName",
      (
        select node.canonical_name from catalog_items as node
        where node.id = coalesce(
          (queue.proposal->>'survivor_id')::uuid,
          (queue.proposal->>'catalog_item_id')::uuid
        )
          and node.id is distinct from queue.subject_catalog_item_id
      ) as "targetName",
      queue.decided_by_user_id::text as "decidedByUserId",
      queue.decided_at as "decidedAt"
    from catalog_curation_queue as queue
    where queue.id = ${queueItemId}::uuid
  `.execute(executor);
  return result.rows[0] ?? null;
}

/** One action as it stands now: what it touched and whether it was undone. */
export interface CurationActionSummary {
  actionId: string;
  reverted: boolean;
  subjectNames: string[];
  /** The cards it touched — what an undo must expire. */
  subjectCatalogItemIds: string[];
  /** Who undid it and when, read from the revert's own row. */
  revertedByUserId: string | null;
  revertedAt: Date | string | null;
}

export async function readCurationActionSummary(
  actionId: string,
  executor: QueryExecutor = db,
): Promise<CurationActionSummary | null> {
  const result = await sql<{
    actionId: string;
    reverted: boolean;
    subjectNames: string[] | null;
    subjectCatalogItemIds: string[] | null;
    revertedByUserId: string | null;
    revertedAt: Date | null;
  }>`
    select
      action.id::text as "actionId",
      action.reverted_by_action_id is not null as reverted,
      coalesce(action.subject_catalog_item_ids::text[], array[]::text[])
        as "subjectCatalogItemIds",
      coalesce((
        select array_agg(node.canonical_name order by node.canonical_name)
        from catalog_items as node
        where node.id = any(action.subject_catalog_item_ids)
      ), array[]::text[]) as "subjectNames",
      revert.performed_by_user_id::text as "revertedByUserId",
      revert.performed_at as "revertedAt"
    from catalog_curation_actions as action
    left join catalog_curation_actions as revert
      on revert.id = action.reverted_by_action_id
    where action.id = ${actionId}::uuid
  `.execute(executor);
  const row = result.rows[0];
  return row
    ? {
        actionId: row.actionId,
        reverted: row.reverted,
        subjectNames: row.subjectNames ?? [],
        subjectCatalogItemIds: row.subjectCatalogItemIds ?? [],
        revertedByUserId: row.revertedByUserId ?? null,
        revertedAt: row.revertedAt ?? null,
      }
    : null;
}

/**
 * The cards the latest decision on a queue item touched. A decision
 * recognised after its reply was lost never had the subjects handed back by
 * the apply function, and its public cards still have to be expired.
 */
export async function readQueueItemActionSubjects(
  queueItemId: string,
  executor: QueryExecutor = db,
): Promise<string[]> {
  const result = await sql<{ subjects: string[] | null }>`
    select coalesce(action.subject_catalog_item_ids::text[], array[]::text[]) as subjects
    from catalog_curation_actions as action
    where action.queue_item_id = ${queueItemId}::uuid
      and action.action_type <> 'revert'
    order by action.performed_at desc, action.id desc
    limit 1
  `.execute(executor);
  return result.rows[0]?.subjects ?? [];
}

export async function countOpenCurationQueue(
  executor: QueryExecutor = db,
): Promise<{ total: number; byType: Record<string, number> }> {
  const result = await sql<{ item_type: string; n: number }>`
    select item_type, count(*)::int as n
    from catalog_curation_queue
    where state = 'open'
      and item_type = any(${sql.val(
        DECIDABLE_CURATION_ITEM_TYPES as readonly string[],
      )}::text[])
    group by item_type order by item_type
  `.execute(executor);
  const byType: Record<string, number> = {};
  let total = 0;
  for (const row of result.rows) {
    byType[row.item_type] = Number(row.n);
    total += Number(row.n);
  }
  return { total, byType };
}

/** Seven days of automatic decisions, newest first, with what each touched. */
export async function listRecentAutomaticActions(
  input: { days?: number; limit?: number } = {},
  executor: QueryExecutor = db,
): Promise<AppliedCurationAction[]> {
  const days = Math.max(1, Math.min(input.days ?? 7, 90));
  const result = await sql<{
    actionId: string;
    actionType: string;
    itemType: string | null;
    ruleCode: string | null;
    reasons: string[] | null;
    subjectNames: string[] | null;
    performedAt: Date;
    automatic: boolean;
    reverted: boolean;
  }>`
    select
      action.id as "actionId",
      action.action_type as "actionType",
      action.payload->>'item_type' as "itemType",
      action.payload->>'rule_code' as "ruleCode",
      coalesce((
        select array_agg(value#>>'{}') from jsonb_array_elements(action.payload->'reasons') as value
      ), array[]::text[]) as "reasons",
      coalesce((
        select array_agg(node.canonical_name order by node.canonical_name)
        from catalog_items as node
        where node.id = any(action.subject_catalog_item_ids)
      ), array[]::text[]) as "subjectNames",
      action.performed_at as "performedAt",
      action.automatic as "automatic",
      action.reverted_by_action_id is not null as "reverted"
    from catalog_curation_actions as action
    where action.automatic
      and action.action_type <> 'revert'
      and action.performed_at >= now() - (${days} || ' days')::interval
    order by action.performed_at desc
    limit ${Math.max(1, Math.min(input.limit ?? 25, 100))}
  `.execute(executor);
  return result.rows.map((row) => ({
    actionId: row.actionId,
    actionType: row.actionType,
    itemType: row.itemType,
    ruleCode: row.ruleCode,
    reasons: row.reasons ?? [],
    subjectNames: row.subjectNames ?? [],
    performedAt: row.performedAt,
    automatic: row.automatic,
    reverted: row.reverted,
  }));
}

/**
 * A source as the owner identifies it: its newest accepted snapshot, and the
 * state of its refresh job (`OVE-506`).
 *
 * This used to be one statement with every count in it, so a single slow
 * source — EPPO's link count, on production — timed the whole list out and
 * the page said nothing about any source. The identity is cheap and read
 * first; each source's counts are their own read
 * (`readCatalogSourceCoverage`), so one that is slow fails beside its own
 * name and the rest are still counted.
 */
export interface CatalogSourceSummary {
  sourceSlug: string;
  sourceName: string;
  sourceVersion: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  attributionText: string | null;
  /** The snapshot the counts are read from. */
  snapshotId: string;
  fetchedAt: Date | string;
  verifiedAt: Date | string;
  /** A newer snapshot than this one was rejected; when it was fetched. */
  rejectedAfterAt: Date | string | null;
  refresh: {
    status: "pending" | "processing" | "done" | "failed" | "dead";
    queuedAt: Date | string;
    updatedAt: Date | string;
  } | null;
}

export function buildCatalogSourcesStatement() {
  return sql<CatalogSourceSummary & { refreshStatus: string | null; refreshQueuedAt: Date | null; refreshUpdatedAt: Date | null }>`
    with current_snapshot as (
      -- The newest imported snapshot is what the catalogue holds; a newer
      -- rejected one is reported beside it rather than counted.
      select distinct on (snapshot.source_slug)
        snapshot.id, snapshot.source_slug, snapshot.source_name, snapshot.source_version,
        snapshot.source_url, snapshot.license, snapshot.license_url, snapshot.attribution_text,
        snapshot.fetched_at, snapshot.verified_at
      from catalog_source_snapshots as snapshot
      order by snapshot.source_slug,
               (snapshot.status = 'imported') desc,
               snapshot.fetched_at desc,
               snapshot.id
    )
    select
      current_snapshot.source_slug as "sourceSlug",
      current_snapshot.source_name as "sourceName",
      current_snapshot.source_version as "sourceVersion",
      current_snapshot.source_url as "sourceUrl",
      current_snapshot.license as "license",
      current_snapshot.license_url as "licenseUrl",
      current_snapshot.attribution_text as "attributionText",
      current_snapshot.id::text as "snapshotId",
      current_snapshot.fetched_at as "fetchedAt",
      current_snapshot.verified_at as "verifiedAt",
      (
        select max(rejected.fetched_at) from catalog_source_snapshots as rejected
        where rejected.source_slug = current_snapshot.source_slug
          and rejected.status = 'rejected'
          and rejected.fetched_at > current_snapshot.fetched_at
      ) as "rejectedAfterAt",
      -- The refresh button enqueues under one idempotency key per source
      -- (buildEnqueueCatalogSourceRefreshJobQuery), so its row is found by
      -- the unique index rather than by scanning the queue's payloads.
      job.status as "refreshStatus",
      job.created_at as "refreshQueuedAt",
      job.updated_at as "refreshUpdatedAt"
    from current_snapshot
    left join job_queue as job
      on job.idempotency_key = 'matching:catalog_source_refresh:' || current_snapshot.source_slug
    order by current_snapshot.source_name, current_snapshot.source_slug
  `;
}

const REFRESH_STATUSES = new Set([
  "pending",
  "processing",
  "done",
  "failed",
  "dead",
]);

export async function listCatalogSources(
  executor: QueryExecutor = db,
): Promise<CatalogSourceSummary[]> {
  const result = await buildCatalogSourcesStatement().execute(executor);
  return result.rows.map((row) => ({
    sourceSlug: row.sourceSlug,
    sourceName: row.sourceName,
    sourceVersion: row.sourceVersion,
    sourceUrl: row.sourceUrl,
    license: row.license,
    licenseUrl: row.licenseUrl,
    attributionText: row.attributionText,
    snapshotId: row.snapshotId,
    fetchedAt: row.fetchedAt,
    verifiedAt: row.verifiedAt,
    rejectedAfterAt: row.rejectedAfterAt ?? null,
    refresh:
      row.refreshStatus && REFRESH_STATUSES.has(row.refreshStatus)
        ? {
            status: row.refreshStatus as NonNullable<
              CatalogSourceSummary["refresh"]
            >["status"],
            queuedAt: row.refreshQueuedAt ?? row.refreshUpdatedAt ?? new Date(0),
            updatedAt: row.refreshUpdatedAt ?? row.refreshQueuedAt ?? new Date(0),
          }
        : null,
  }));
}

/** What one snapshot holds, and how much of it reached the graph. */
export interface CatalogSourceCoverage {
  recordCount: number;
  linkedCount: number;
  identifierCount: number;
  assertionCount: number;
}

export function buildCatalogSourceCoverageStatement(snapshotId: string) {
  return sql<CatalogSourceCoverage>`
    select
      (select count(*)::int from catalog_source_records
        where source_snapshot_id = ${snapshotId}::uuid) as "recordCount",
      -- Records with a link, not links: one record can link to two cards
      -- after a merge, and the page says how many records reached a card.
      (
        select count(distinct link.source_record_id)::int
        from catalog_source_links as link
        join catalog_source_records as record on record.id = link.source_record_id
        where record.source_snapshot_id = ${snapshotId}::uuid
      ) as "linkedCount",
      (
        select count(*)::int from catalog_item_identifiers as identifier
        join catalog_source_assertions as assertion on assertion.id = identifier.assertion_id
        where assertion.source_snapshot_id = ${snapshotId}::uuid
      ) as "identifierCount",
      (select count(*)::int from catalog_source_assertions
        where source_snapshot_id = ${snapshotId}::uuid) as "assertionCount"
  `;
}

export async function readCatalogSourceCoverage(
  snapshotId: string,
  executor: QueryExecutor = db,
): Promise<CatalogSourceCoverage> {
  const result =
    await buildCatalogSourceCoverageStatement(snapshotId).execute(executor);
  const row = result.rows[0];
  return {
    recordCount: Number(row?.recordCount ?? 0),
    linkedCount: Number(row?.linkedCount ?? 0),
    identifierCount: Number(row?.identifierCount ?? 0),
    assertionCount: Number(row?.assertionCount ?? 0),
  };
}

/** How many gardener objects a merge would move; over fifty asks for a confirmation. */
export const MERGE_CONFIRMATION_OBJECT_THRESHOLD = 50;

export async function countObjectsOnCatalogItem(
  catalogItemId: string,
  executor: QueryExecutor = db,
): Promise<number> {
  const result = await sql<{ n: number }>`
    select count(*)::int as n from plant_objects where catalog_item_id = ${catalogItemId}::uuid
  `.execute(executor);
  return Number(result.rows[0]?.n ?? 0);
}

/** What the weekly digest counts (ADR-0026 D10): numbers, never a name. */
export async function readCurationDigestSummary(
  executor: QueryExecutor = db,
): Promise<{
  openItems: number;
  newItems: number;
  withGardenerObjects: number;
  autoAppliedItems: number;
}> {
  const result = await sql<{
    open_items: number;
    new_items: number;
    with_gardener_objects: number;
    auto_applied_items: number;
  }>`
    select
      count(*) filter (where queue.state = 'open')::int as open_items,
      count(*) filter (where queue.state = 'open' and queue.created_at >= now() - interval '7 days')::int as new_items,
      count(*) filter (
        where queue.state = 'open'
          and (
            exists (
              select 1 from plant_objects
              where plant_objects.catalog_item_id = queue.subject_catalog_item_id
            )
            or (
              queue.subject_label is not null
              and exists (
                select 1 from plant_objects
                where plant_objects.variety_state = 'free_text'
                  and plant_objects.catalog_item_id is null
                  and plant_objects.variety_text is not null
                  and catalog_normalize_name(plant_objects.variety_text)
                      = catalog_normalize_name(queue.subject_label)
              )
            )
          )
      )::int as with_gardener_objects,
      (
        select count(*)::int from catalog_curation_actions as action
        where action.automatic
          and action.action_type <> 'revert'
          and action.performed_at >= now() - interval '7 days'
      ) as auto_applied_items
    from catalog_curation_queue as queue
  `.execute(executor);
  const row = result.rows[0];
  return {
    openItems: Number(row?.open_items ?? 0),
    newItems: Number(row?.new_items ?? 0),
    withGardenerObjects: Number(row?.with_gardener_objects ?? 0),
    autoAppliedItems: Number(row?.auto_applied_items ?? 0),
  };
}
