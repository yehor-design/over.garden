import "server-only";

import { sql } from "kysely";

import type { CatalogKind } from "@/db/schema";

/**
 * The catalog kind, derived from what a node is (OVE-399, ADR-0026 D15).
 *
 * The flat catalog stored the kind in its own column, decided at insert and
 * never revisited. The graph derives it from `node_kind`, and the two could
 * disagree — a row inserted as a `species` that later became a cultivar kept
 * the old word. Migration `0061` drops the column; this is the one place that
 * says what the three values mean, so every reader gets the same answer from
 * the same source.
 *
 * The concept survives because it is what a *reader* needs: "species", "sort",
 * "breed" is the vocabulary of the interface, and `taxon`/`cultivar`/`breed`
 * is the vocabulary of the graph. Only the column is gone.
 */
export function catalogKindSql(alias: string) {
  const node = sql.raw(`${alias}.node_kind`);
  return sql<CatalogKind>`case
    when ${node} = 'taxon' then 'species'
    when ${node} = 'cultivar' then 'plant_variety'
    else 'breed'
  end`;
}

/** The same mapping in TypeScript, for a row already read. */
export function catalogKindOfNodeKind(nodeKind: string): CatalogKind {
  if (nodeKind === "taxon") return "species";
  if (nodeKind === "cultivar") return "plant_variety";
  return "breed";
}

/** The inverse: the node kind a reader's word means. */
export function nodeKindOfCatalogKind(
  catalogKind: string,
): "taxon" | "cultivar" | "breed" {
  if (catalogKind === "species") return "taxon";
  if (catalogKind === "plant_variety") return "cultivar";
  return "breed";
}
