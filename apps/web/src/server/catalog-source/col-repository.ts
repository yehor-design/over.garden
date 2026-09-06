import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import { CATALOG_TYPEAHEAD_DEADLINE_MS } from "@/server/catalog-repository";
import type { Database } from "@/db/schema";
import type { PlantObjectKind } from "@/db/schema";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * Reading the full Catalogue of Life checklist (OVE-392, ADR-0026 D7).
 *
 * The picker's primary list is canonical nodes; this is the secondary path
 * behind it, over the newest ingested release. Nothing here is journal-backed
 * and nothing is owner-scoped: a release is public reference data, and the
 * rows are read exactly as Catalogue of Life published them.
 *
 * The picker offers this path only when the primary list is thin, so these
 * reads are rare and bounded: a prefix match first, the trigram index behind
 * it, at most a screenful of rows.
 */
export const COL_SOURCE_SLUG = "catalogue-of-life-checklistbank";
export const COL_SEARCH_LIMIT = 8;
export const COL_SEARCH_MIN_QUERY_LENGTH = 3;

export interface ColUsageRow {
  colId: string;
  canonicalName: string;
  scientificName: string;
  authorship: string | null;
  rank: string | null;
  kingdom: string | null;
  status: string;
  /** The accepted name this row hangs under, when the row is a synonym. */
  acceptedName: string | null;
}

/** Kingdoms a gardener's object of that kind can plausibly be. */
const KINGDOMS_BY_OBJECT_KIND: Record<PlantObjectKind, readonly string[]> = {
  plant: ["Plantae", "Fungi", "Chromista"],
  animal: ["Animalia"],
};

export function buildColUsageSearchStatement(input: {
  normalizedQuery: string;
  objectKind: PlantObjectKind;
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? COL_SEARCH_LIMIT, 1), 20);
  const kingdoms = KINGDOMS_BY_OBJECT_KIND[input.objectKind];
  const prefix = `${input.normalizedQuery}%`;
  return sql<{
    col_id: string;
    canonical_name: string;
    scientific_name: string;
    authorship: string | null;
    rank: string | null;
    kingdom: string | null;
    status: string;
    accepted_name: string | null;
  }>`
    with snapshot as (
      select catalog_col_current_snapshot() as id
    )
    select
      usage.col_id,
      usage.canonical_name,
      usage.scientific_name,
      usage.authorship,
      usage.rank,
      usage.kingdom,
      usage.status,
      (
        select accepted.canonical_name
        from catalog_source_col_usages as accepted
        where accepted.source_snapshot_id = usage.source_snapshot_id
          and accepted.col_id = usage.parent_col_id
          and usage.status in ('synonym', 'ambiguous_synonym')
      ) as accepted_name
    from catalog_source_col_usages as usage
    join snapshot on snapshot.id = usage.source_snapshot_id
    where usage.normalized_name like ${prefix}
      and usage.status in (
        'accepted', 'provisionally_accepted', 'synonym', 'ambiguous_synonym'
      )
      -- A kingdom the object cannot be is not a candidate; a usage without a
      -- kingdom (Catalogue of Life leaves synonyms bare) stays in the list.
      and (usage.kingdom is null or usage.kingdom = any(${kingdoms}::text[]))
    order by
      case usage.status when 'accepted' then 0 when 'provisionally_accepted' then 1 else 2 end,
      length(usage.canonical_name),
      usage.canonical_name
    limit ${limit}
  `;
}

export async function searchColUsages(
  query: string,
  options: { objectKind: PlantObjectKind; limit?: number },
  executor: QueryExecutor = db,
): Promise<ColUsageRow[]> {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/gu, " ");
  if (normalizedQuery.length < COL_SEARCH_MIN_QUERY_LENGTH) return [];
  const statement = buildColUsageSearchStatement({
    normalizedQuery,
    objectKind: options.objectKind,
    limit: options.limit,
  });
  /**
   * The same deadline the primary list runs under, and for a sharper reason:
   * an ingest holds the table's lock while it loads a release without its
   * indexes, so a read taken at that moment waits rather than answers. A
   * bounded statement turns that into an ordinary 503 the composer already
   * handles, instead of a request that hangs.
   */
  const result =
    executor === db
      ? await db.transaction().execute(async (trx) => {
          await sql`set local statement_timeout = ${sql.lit(
            String(CATALOG_TYPEAHEAD_DEADLINE_MS),
          )}`.execute(trx);
          await sql`set local lock_timeout = ${sql.lit(
            String(CATALOG_TYPEAHEAD_DEADLINE_MS),
          )}`.execute(trx);
          return statement.execute(trx);
        })
      : // A caller that brought its own executor owns the bound: a test, or a
        // transaction that already set one.
        await statement.execute(executor);
  return result.rows.map((row) => ({
    colId: row.col_id,
    canonicalName: row.canonical_name,
    scientificName: row.scientific_name,
    authorship: row.authorship,
    rank: row.rank,
    kingdom: row.kingdom,
    status: row.status,
    acceptedName: row.accepted_name,
  }));
}

/** Whether a release has been ingested at all; the link is hidden without one. */
export async function hasColSnapshot(
  executor: QueryExecutor = db,
): Promise<boolean> {
  const result = await sql<{ present: boolean }>`
    select catalog_col_current_snapshot() is not null as present
  `.execute(executor);
  return result.rows[0]?.present ?? false;
}
