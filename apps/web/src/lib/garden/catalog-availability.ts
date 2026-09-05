import type { FirstEntryCatalogSelection } from "@/lib/garden/entry-contracts";
import type { CatalogTypeaheadClientState } from "@/lib/garden/catalog-typeahead-contract";

/**
 * What the picker can offer right now (ADR-0026 D5, D7).
 *
 * The list is one of three things: rows to pick from, a genuine "nothing
 * matched", or a route that did not answer. Only the third hides the catalog
 * rows; every state keeps the own-name outcome, so a gardener is never
 * blocked by the catalog, the worker or the network.
 */
export type CatalogPickerAvailability =
  | "idle"
  | "searching"
  | "ready"
  | "empty"
  | "unavailable";

export function catalogPickerAvailabilityForResponse(input: {
  ok: boolean;
  state: CatalogTypeaheadClientState;
  rowCount: number;
}): CatalogPickerAvailability {
  if (!input.ok || input.state === "unavailable") return "unavailable";
  return input.rowCount > 0 && input.state === "ready" ? "ready" : "empty";
}

/** The own-name outcome is offered whenever there is a name to add. */
export function offersOwnNameOutcome(query: string, minLength = 2) {
  return query.trim().replace(/\s+/g, " ").length >= minLength;
}

export interface CatalogPickerRow extends FirstEntryCatalogSelection {
  /**
   * True when another row in the same list carries the same display name, so
   * the row must show what tells the two apart (its kind, its species, the
   * name that matched) rather than the name alone.
   */
  homonymous: boolean;
}

export function classifyHomonymousCatalogRows(
  rows: readonly FirstEntryCatalogSelection[],
): CatalogPickerRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = homonymKey(row.displayName);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.map((row) => ({
    ...row,
    homonymous: (counts.get(homonymKey(row.displayName)) ?? 0) > 1,
  }));
}

function homonymKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
