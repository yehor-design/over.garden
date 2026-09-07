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

/** No, with the owner's decision recorded on the item. */
export async function rejectCatalogQueueItem(
  input: { queueItemId: string; actorUserId: string },
  executor: QueryExecutor = db,
): Promise<void> {
  await sql`
    update catalog_curation_queue
    set state = 'rejected', decided_by_user_id = ${input.actorUserId}::uuid,
        decided_at = now(), updated_at = now()
    where id = ${input.queueItemId}::uuid and state = 'open'
  `.execute(executor);
}

/** Later: the item leaves the stream without a decision either way. */
export async function skipCatalogQueueItem(
  input: { queueItemId: string; actorUserId: string },
  executor: QueryExecutor = db,
): Promise<void> {
  await sql`
    update catalog_curation_queue
    set state = 'skipped', decided_by_user_id = ${input.actorUserId}::uuid,
        decided_at = now(), updated_at = now()
    where id = ${input.queueItemId}::uuid and state = 'open'
  `.execute(executor);
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
 * The open queue, highest impact first (ADR-0026 D10). One statement: each
 * item carries both sides of the decision, so the page shows two cards
 * without a second round trip per item.
 */
export function buildCurationQueueStatement(input: {
  itemType?: string | null;
  limit?: number;
}) {
  const typeFilter = input.itemType
    ? sql`and queue.item_type = ${input.itemType}`
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
      queue.proposal->>'source_slug' as "sourceSlug"
    from catalog_curation_queue as queue
    where queue.state = 'open'
      ${typeFilter}
    order by queue.impact_score desc, queue.created_at asc
    limit ${Math.max(1, Math.min(input.limit ?? 20, 100))}
  `;
}

export async function listOpenCurationQueue(
  input: { itemType?: string | null; limit?: number } = {},
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
  }));
}

export async function countOpenCurationQueue(
  executor: QueryExecutor = db,
): Promise<{ total: number; byType: Record<string, number> }> {
  const result = await sql<{ item_type: string; n: number }>`
    select item_type, count(*)::int as n
    from catalog_curation_queue where state = 'open'
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

export interface CatalogSourceCard {
  sourceSlug: string;
  sourceName: string;
  sourceVersion: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  attributionText: string | null;
  fetchedAt: Date | string;
  status: string;
  recordCount: number;
  linkedCount: number;
  identifierCount: number;
  assertionCount: number;
  lastRefreshQueuedAt: Date | string | null;
  lastRefreshStatus: string | null;
}

/**
 * One card per source, from its newest snapshot, with the counts the owner
 * decides by: what the source holds, how much of it is linked to a node, and
 * whether a refresh is queued.
 */
export function buildCatalogSourceCardsStatement() {
  return sql<CatalogSourceCard>`
    with newest as (
      select distinct on (snapshot.source_slug)
        snapshot.id, snapshot.source_slug, snapshot.source_name, snapshot.source_version,
        snapshot.source_url, snapshot.license, snapshot.license_url, snapshot.attribution_text,
        snapshot.fetched_at, snapshot.status
      from catalog_source_snapshots as snapshot
      order by snapshot.source_slug, snapshot.fetched_at desc, snapshot.id
    )
    select
      newest.source_slug as "sourceSlug",
      newest.source_name as "sourceName",
      newest.source_version as "sourceVersion",
      newest.source_url as "sourceUrl",
      newest.license as "license",
      newest.license_url as "licenseUrl",
      newest.attribution_text as "attributionText",
      newest.fetched_at as "fetchedAt",
      newest.status as "status",
      (select count(*)::int from catalog_source_records where source_snapshot_id = newest.id) as "recordCount",
      (
        select count(*)::int from catalog_source_links as link
        join catalog_source_records as record on record.id = link.source_record_id
        where record.source_snapshot_id = newest.id
      ) as "linkedCount",
      (
        select count(*)::int from catalog_item_identifiers as identifier
        join catalog_source_assertions as assertion on assertion.id = identifier.assertion_id
        where assertion.source_snapshot_id = newest.id
      ) as "identifierCount",
      (select count(*)::int from catalog_source_assertions where source_snapshot_id = newest.id) as "assertionCount",
      (
        select job.created_at from job_queue as job
        where job.queue_name = 'matching'
          and job.payload->>'kind' = 'catalog_source_refresh'
          and job.payload->>'source_slug' = newest.source_slug
        order by job.created_at desc limit 1
      ) as "lastRefreshQueuedAt",
      (
        select job.status from job_queue as job
        where job.queue_name = 'matching'
          and job.payload->>'kind' = 'catalog_source_refresh'
          and job.payload->>'source_slug' = newest.source_slug
        order by job.created_at desc limit 1
      ) as "lastRefreshStatus"
    from newest
    order by newest.source_name, newest.source_slug
  `;
}

export async function listCatalogSourceCards(
  executor: QueryExecutor = db,
): Promise<CatalogSourceCard[]> {
  const result = await buildCatalogSourceCardsStatement().execute(executor);
  return result.rows.map((row) => ({
    ...row,
    recordCount: Number(row.recordCount),
    linkedCount: Number(row.linkedCount),
    identifierCount: Number(row.identifierCount),
    assertionCount: Number(row.assertionCount),
  }));
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
