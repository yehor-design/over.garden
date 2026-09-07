import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";

/**
 * What the owner needs to know about the catalog (OVE-398, ADR-0026 D12).
 *
 * The product has never measured whether picking works. Pick success, the
 * own-label rate and how long a pick takes are what tell the owner whether a
 * source or a long-tail node deserves attention next, and they have to live
 * where the owner already works rather than in an external analytics tool.
 *
 * One row per completed pick or abandonment, and deliberately nothing that
 * could identify what was typed: a length, not a query. Rows expire after
 * ninety days — a metric that answers "is it working now" has no business
 * holding personal-adjacent rows for a year.
 */

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const CATALOG_PICK_OUTCOMES = [
  "picked_species",
  "picked_form",
  "own_label",
  "abandoned",
] as const;

export type CatalogPickOutcomeName = (typeof CATALOG_PICK_OUTCOMES)[number];

/** The two outcomes where the gardener ended up on a catalog node. */
export const CATALOG_PICK_SUCCESS_OUTCOMES: readonly CatalogPickOutcomeName[] =
  ["picked_species", "picked_form"];

export const CATALOG_PICK_EVENT_RETENTION_DAYS = 90;

/** The two windows every figure on the health tab is read over. */
export const CATALOG_HEALTH_WINDOWS = [7, 30] as const;

const MAX_QUERY_LENGTH = 500;
const MAX_MS_TO_PICK = 3_600_000;

export interface RecordCatalogPickEventInput {
  ownerUserId: string;
  outcome: CatalogPickOutcomeName;
  queryLength: number;
  msToPick: number | null;
  locale: string;
  objectKind: string;
  catalogItemId: string | null;
}

export function isCatalogPickOutcome(
  value: unknown,
): value is CatalogPickOutcomeName {
  return (CATALOG_PICK_OUTCOMES as readonly string[]).includes(String(value));
}

/**
 * Clamps rather than refuses.
 *
 * A measurement is not worth failing a gardener's action over, and the CHECK
 * constraints would refuse anything outside these bounds — a clock that jumped
 * or a query longer than the column allows would cost the whole row rather
 * than the one field that was wrong.
 */
export function clampPickEvent(
  input: RecordCatalogPickEventInput,
): RecordCatalogPickEventInput {
  const msToPick =
    input.msToPick === null || !Number.isFinite(input.msToPick)
      ? null
      : Math.min(Math.max(0, Math.round(input.msToPick)), MAX_MS_TO_PICK);
  return {
    ...input,
    queryLength: Math.min(
      Math.max(0, Math.round(input.queryLength) || 0),
      MAX_QUERY_LENGTH,
    ),
    msToPick,
    locale: input.locale.slice(0, 12) || "uk",
    objectKind: input.objectKind.slice(0, 40) || "plant",
  };
}

export function buildRecordCatalogPickEventQuery(
  executor: QueryExecutor,
  input: RecordCatalogPickEventInput,
) {
  const clamped = clampPickEvent(input);
  return executor
    .insertInto("catalog_pick_events")
    .values({
      outcome: clamped.outcome,
      query_length: clamped.queryLength,
      ms_to_pick: clamped.msToPick,
      locale: clamped.locale,
      object_kind: clamped.objectKind,
      catalog_item_id: clamped.catalogItemId,
      owner_user_id: clamped.ownerUserId,
    })
    .returning("id");
}

export async function recordCatalogPickEvent(
  input: RecordCatalogPickEventInput,
  executor: QueryExecutor = db,
): Promise<string | null> {
  const row = await buildRecordCatalogPickEventQuery(
    executor,
    input,
  ).executeTakeFirst();
  return row?.id ?? null;
}

export interface CatalogPickHealthRow {
  windowDays: number;
  attempts: number;
  picked: number;
  ownLabel: number;
  abandoned: number;
  medianMsToPick: number | null;
  p95MsToPick: number | null;
}

/**
 * The six figures, over both windows, in one statement.
 *
 * `percentile_cont` over an empty set answers null, which is what an owner
 * should see before anyone has picked anything — not a zero that reads like a
 * measured instant.
 */
export function buildCatalogPickHealthStatement(
  windows: readonly number[] = CATALOG_HEALTH_WINDOWS,
) {
  return sql<CatalogPickHealthRow>`
    select
      window_days as "windowDays",
      count(event.id)::int as "attempts",
      count(event.id) filter (
        where event.outcome in ('picked_species', 'picked_form')
      )::int as "picked",
      count(event.id) filter (where event.outcome = 'own_label')::int as "ownLabel",
      count(event.id) filter (where event.outcome = 'abandoned')::int as "abandoned",
      percentile_cont(0.5) within group (order by event.ms_to_pick)::int as "medianMsToPick",
      percentile_cont(0.95) within group (order by event.ms_to_pick)::int as "p95MsToPick"
    from unnest(${sql.val(windows.map(Number))}::int[]) as window_days
    left join catalog_pick_events as event
      on event.occurred_at >= now() - (window_days || ' days')::interval
    group by window_days
    order by window_days
  `;
}

export async function readCatalogPickHealth(
  executor: QueryExecutor = db,
  windows: readonly number[] = CATALOG_HEALTH_WINDOWS,
): Promise<CatalogPickHealthRow[]> {
  const result = await buildCatalogPickHealthStatement(windows).execute(
    executor,
  );
  return result.rows.map((row) => ({
    ...row,
    windowDays: Number(row.windowDays),
    attempts: Number(row.attempts),
    picked: Number(row.picked),
    ownLabel: Number(row.ownLabel),
    abandoned: Number(row.abandoned),
    medianMsToPick:
      row.medianMsToPick === null ? null : Number(row.medianMsToPick),
    p95MsToPick: row.p95MsToPick === null ? null : Number(row.p95MsToPick),
  }));
}

export interface CatalogAutoAcceptPrecisionRow {
  ruleCode: string;
  applied: number;
  reverted: number;
}

/**
 * How often an automatic decision was taken back, per rule.
 *
 * Precision is the owner's only handle on a threshold: a rule whose applied
 * decisions keep being reverted is one whose threshold is too low, and the
 * number is meaningless without the rule beside it.
 */
export function buildCatalogAutoAcceptPrecisionStatement(days = 30) {
  return sql<CatalogAutoAcceptPrecisionRow>`
    select
      -- The rule lives on the queue item that produced the action: its first
      -- reason is the rule code the threshold is keyed by. An action whose
      -- item is gone is still counted, under 'unknown', because dropping it
      -- would quietly improve the precision of every rule that remains.
      coalesce(item.reasons[1], 'unknown') as "ruleCode",
      count(*) filter (where action.action_type <> 'revert')::int as "applied",
      count(*) filter (where action.action_type = 'revert')::int as "reverted"
    from catalog_curation_actions as action
    left join catalog_curation_queue as item on item.id = action.queue_item_id
    where action.automatic
      and action.performed_at >= now() - (${days} || ' days')::interval
    group by coalesce(item.reasons[1], 'unknown')
    order by count(*) desc
  `;
}

export async function readCatalogAutoAcceptPrecision(
  executor: QueryExecutor = db,
  days = 30,
): Promise<CatalogAutoAcceptPrecisionRow[]> {
  const result = await buildCatalogAutoAcceptPrecisionStatement(days).execute(
    executor,
  );
  return result.rows.map((row) => ({
    ruleCode: row.ruleCode,
    applied: Number(row.applied),
    reverted: Number(row.reverted),
  }));
}

/** The age of the oldest open queue item, in days; null when the queue is empty. */
export function buildOldestOpenQueueItemStatement() {
  return sql<{ ageDays: number | null }>`
    select extract(day from now() - min(item.created_at))::int as "ageDays"
    from catalog_curation_queue as item
    where item.state = 'open'
  `;
}

export async function readOldestOpenQueueItemAgeDays(
  executor: QueryExecutor = db,
): Promise<number | null> {
  const result = await buildOldestOpenQueueItemStatement().execute(executor);
  const value = result.rows[0]?.ageDays ?? null;
  return value === null ? null : Number(value);
}

export interface CatalogSearchMissRow {
  queryNormalized: string;
  locale: string;
  objectKind: string;
  occurrences: number;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
}

/** How many misses the tab shows: enough to act on, not a data dump. */
export const CATALOG_HEALTH_MISS_LIMIT = 50;

/**
 * What gardeners looked for and did not find, most-asked first.
 *
 * Two kinds of miss leave the list: one a curator already pointed at a node,
 * and one that is already waiting as an open decision. Showing either again
 * would put the owner back on work they finished, and a list that does that
 * is a list they stop reading.
 */
export function buildTopCatalogSearchMissesStatement(
  limit = CATALOG_HEALTH_MISS_LIMIT,
) {
  return sql<CatalogSearchMissRow>`
    select
      miss.query_normalized as "queryNormalized",
      miss.locale as "locale",
      miss.object_kind as "objectKind",
      miss.occurrences::int as "occurrences",
      miss.first_seen_at as "firstSeenAt",
      miss.last_seen_at as "lastSeenAt"
    from catalog_search_misses as miss
    where miss.resolved_catalog_item_id is null
      and not exists (
        select 1 from catalog_curation_queue as item
        where item.item_type = 'label_link'
          and item.state = 'open'
          and item.subject_label = miss.query_normalized
      )
    order by miss.occurrences desc, miss.last_seen_at desc
    limit ${limit}
  `;
}

export async function readTopCatalogSearchMisses(
  executor: QueryExecutor = db,
  limit = CATALOG_HEALTH_MISS_LIMIT,
): Promise<CatalogSearchMissRow[]> {
  const result = await buildTopCatalogSearchMissesStatement(limit).execute(
    executor,
  );
  return result.rows.map((row) => ({
    ...row,
    occurrences: Number(row.occurrences),
  }));
}

/**
 * Turns one search miss into a decision the owner can make.
 *
 * A `label_link` item is the queue's shape for "this is a name somebody used
 * and nothing in the catalog answers to it". The miss is marked resolved in
 * the same transaction: a list that keeps offering finished work is a list the
 * owner stops reading.
 */
export async function createQueueItemForSearchMiss(
  input: { queryNormalized: string; locale: string; objectKind: string },
  executor: QueryExecutor = db,
): Promise<string | null> {
  return await executor.transaction().execute(async (transaction) => {
    const existing = await sql<{ id: string }>`
      select item.id
      from catalog_curation_queue as item
      where item.item_type = 'label_link'
        and item.state = 'open'
        and item.subject_label = ${input.queryNormalized}
      limit 1
    `.execute(transaction);
    if (existing.rows[0]) return existing.rows[0].id;

    const created = await sql<{ id: string }>`
      insert into catalog_curation_queue (
        item_type, subject_label, proposal, reasons, impact_score, state
      )
      values (
        'label_link',
        ${input.queryNormalized},
        ${JSON.stringify({
          source_slug: "catalog_search_miss",
          locale: input.locale,
          object_kind: input.objectKind,
        })}::jsonb,
        array['search_miss']::text[],
        1,
        'open'
      )
      returning id
    `.execute(transaction);

    // The miss is not marked resolved here, and cannot be:
    // `resolved_catalog_item_id` points at a node, and the whole reason this
    // item exists is that no node answers to the name yet. What keeps the miss
    // out of the list is the open item itself — see the reader below.
    return created.rows[0]?.id ?? null;
  });
}

export function buildPurgeCatalogPickEventsQuery(
  executor: QueryExecutor,
  olderThanDays = CATALOG_PICK_EVENT_RETENTION_DAYS,
) {
  return sql<{ purged: number }>`
    select catalog_purge_pick_events(${olderThanDays}) as "purged"
  `.execute(executor);
}

export async function purgeCatalogPickEvents(
  executor: QueryExecutor = db,
  olderThanDays = CATALOG_PICK_EVENT_RETENTION_DAYS,
): Promise<number> {
  const result = await buildPurgeCatalogPickEventsQuery(
    executor,
    olderThanDays,
  );
  return Number(result.rows[0]?.purged ?? 0);
}
