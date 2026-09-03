import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import type { Database } from "@/db/schema";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/** Columns added by migration 0047 (OVE-371). */
export const MEDIA_VARIANT_COLUMNS = [
  "placeholder_data_uri",
  "variant_long_edges",
] as const;

const RECHECK_INTERVAL_MS = 60_000;

let probe: { available: boolean; checkedAtMs: number } | null = null;

/**
 * The web deploy may reach production before the owner applies migration
 * 0047 by hand (production migrations are never automatic). Until the
 * columns exist, every writer leaves them out and every reader treats them as
 * null, so the deploy is safe in either order. A positive probe is final for
 * the process; a negative one is re-checked once a minute.
 */
export async function mediaVariantColumnsAvailable(
  executor: QueryExecutor,
): Promise<boolean> {
  if (probe?.available) return true;
  if (probe && Date.now() - probe.checkedAtMs < RECHECK_INTERVAL_MS) {
    return false;
  }
  let available = false;
  try {
    const result = await sql<{ count: number }>`
      select count(*)::int as count
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = 'media_assets'
        and column_name in ('placeholder_data_uri', 'variant_long_edges')
    `.execute(executor);
    available =
      Number(result.rows[0]?.count ?? 0) === MEDIA_VARIANT_COLUMNS.length;
  } catch {
    // An unreadable catalog reads as "not yet"; the caller's own query will
    // surface a real outage, and the probe is retried a minute later.
    available = false;
  }
  probe = { available, checkedAtMs: Date.now() };
  return available;
}

/** Test seam: forget the probe result. */
export function resetMediaVariantSchemaProbeForTests(
  value: boolean | null = null,
) {
  probe = value === null ? null : { available: value, checkedAtMs: Date.now() };
}

export interface MediaVariantExtras {
  placeholderDataUri: string | null;
  variantLongEdges: number[];
}

/**
 * Reads the OVE-371 columns for a bounded set of assets in one query, or an
 * empty map until migration 0047 is live. Callers merge it into read models
 * they already have, so the existing typed selects stay untouched.
 */
export async function readMediaVariantExtras(
  executor: QueryExecutor,
  mediaAssetIds: readonly string[],
): Promise<Map<string, MediaVariantExtras>> {
  const extras = new Map<string, MediaVariantExtras>();
  const ids = [...new Set(mediaAssetIds)];
  if (ids.length === 0 || !(await mediaVariantColumnsAvailable(executor))) {
    return extras;
  }
  const rows = await executor
    .selectFrom("media_assets")
    .select(["id", "placeholder_data_uri", "variant_long_edges"])
    .where("id", "in", ids)
    .execute();
  for (const row of rows) {
    extras.set(row.id, {
      placeholderDataUri: row.placeholder_data_uri ?? null,
      variantLongEdges: Array.isArray(row.variant_long_edges)
        ? row.variant_long_edges.map(Number)
        : [],
    });
  }
  return extras;
}
