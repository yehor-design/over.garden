import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database } from "@/db/schema";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import type { FirstEntryCatalogSelection } from "@/lib/garden/entry-contracts";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * Create-on-pick from the full checklist (OVE-392, ADR-0026 D7).
 *
 * A gardener who reaches past the primary list and picks a Catalogue of Life
 * usage gets a canonical node from that moment: the node, its ancestors up to
 * the kingdom, its `col` identifier and its accepted name. The write itself is
 * `catalog_col_materialize` (migration 0057) — the same function the ingest's
 * scoped materialization uses — so there is one implementation of "a node
 * from the checklist", not two.
 *
 * Idempotent by construction: `catalog_item_identifiers` is unique on
 * `(scheme, value)`, so picking the same usage twice returns the same node.
 */
export interface MaterializedColNode {
  catalogItemId: string;
  canonicalName: string;
  publicSlug: string | null;
  rank: string | null;
  kingdom: string | null;
  created: boolean;
}

export async function materializeCatalogNodeFromCol(
  colId: string,
  executor: QueryExecutor = db,
): Promise<MaterializedColNode> {
  const trimmed = colId.trim();
  if (!/^[A-Za-z0-9._:-]{1,64}$/u.test(trimmed)) {
    throw new Error("A Catalogue of Life identifier looks nothing like that.");
  }

  const before = await sql<{ present: boolean }>`
    select exists (
      select 1 from catalog_item_identifiers
      where scheme = 'col' and value = ${trimmed}
    ) as present
  `.execute(executor);

  /**
   * Two statements, and it matters: a query's snapshot is taken before it
   * runs, so joining `catalog_items` in the same statement that calls the
   * function finds nothing — the node is created and the read comes back
   * empty. The same trap cost the curation apply path a 500 in OVE-391.
   */
  const materialized = await sql<{ id: string }>`
    select catalog_col_materialize(${trimmed})::text as id
  `.execute(executor);
  const catalogItemId = materialized.rows[0]?.id;
  if (!catalogItemId) {
    throw new Error("catalog_col_materialize returned no node");
  }

  const created = await sql<{
    id: string;
    canonical_name: string;
    public_slug: string | null;
    rank: string | null;
    kingdom: string | null;
  }>`
    select
      item.id::text as id,
      item.canonical_name,
      item.public_slug,
      item.rank,
      item.kingdom
    from catalog_items as item
    where item.id = ${catalogItemId}::uuid
  `.execute(executor);

  const row = created.rows[0];
  if (!row) {
    throw new Error("catalog_col_materialize returned no node");
  }
  return {
    catalogItemId: row.id,
    canonicalName: row.canonical_name,
    publicSlug: row.public_slug,
    rank: row.rank,
    kingdom: row.kingdom,
    created: !(before.rows[0]?.present ?? false),
  };
}

/** The materialized node as the picker holds a selection. */
export function toPickerSelection(
  node: MaterializedColNode,
): FirstEntryCatalogSelection {
  const selection: FirstEntryCatalogSelection = {
    id: node.catalogItemId,
    displayName: node.canonicalName,
    kind: "species",
  };
  if (node.publicSlug) {
    selection.publicPath = publicCatalogEvidencePath({
      catalogKind: "species",
      publicSlug: node.publicSlug,
      speciesSlug: null,
    });
  }
  return selection;
}
