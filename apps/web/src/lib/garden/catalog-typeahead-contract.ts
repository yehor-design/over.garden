import type { PlantObjectKind } from "@/db/schema";
import type {
  CatalogPickerKind,
  FirstEntryCatalogSelection,
} from "@/lib/garden/entry-contracts";
import type { PublicLocale } from "@/lib/public-localization";

export const CATALOG_TYPEAHEAD_PUBLIC_PATH = "/api/public/catalog/typeahead";
export const CATALOG_TYPEAHEAD_MAX_QUERY_LENGTH = 120;
export const CATALOG_TYPEAHEAD_MIN_QUERY_LENGTH = 2;
/** A query this long that ends without a pick is worth recording as a miss. */
export const CATALOG_SEARCH_MISS_MIN_QUERY_LENGTH = 3;

/**
 * What the picker holds: an organism from the list, or the gardener's own
 * name, which is a text label on the object and never a catalog row
 * (ADR-0026 D6).
 */
export type CatalogPickerSelection =
  | { kind: "item"; row: FirstEntryCatalogSelection }
  | { kind: "own_name"; name: string };

export function buildCatalogTypeaheadUrl(input: {
  query: string;
  objectKind: PlantObjectKind;
  locale: PublicLocale;
  /** `full` searches the whole Catalogue of Life release (ADR-0026 D7). */
  scope?: CatalogTypeaheadScope;
}) {
  const params = new URLSearchParams({
    q: input.query.slice(0, CATALOG_TYPEAHEAD_MAX_QUERY_LENGTH),
    kind: input.objectKind,
    locale: input.locale,
  });
  if (input.scope === "full") params.set("scope", "full");
  return `${CATALOG_TYPEAHEAD_PUBLIC_PATH}?${params.toString()}`;
}

/**
 * The two lists behind the picker (ADR-0026 D7): canonical nodes first, and
 * the whole checklist one tap away. A full-catalogue row is not a node yet —
 * it carries a Catalogue of Life identifier, and picking it is what creates
 * the node.
 */
export type CatalogTypeaheadScope = "canonical" | "full";

export interface CatalogFullCatalogueRow {
  colId: string;
  displayName: string;
  scientificName: string;
  rank: string | null;
  /** The accepted name, when the row a gardener recognised is a synonym. */
  acceptedName: string | null;
}

export function parseCatalogFullCatalogueResponse(
  value: unknown,
): CatalogFullCatalogueRow[] {
  if (!value || typeof value !== "object") return [];
  const suggestions = (value as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions)) return [];

  return suggestions.flatMap((suggestion) => {
    if (!suggestion || typeof suggestion !== "object") return [];
    const candidate = suggestion as Record<string, unknown>;
    if (
      !isColIdentifier(candidate.colId) ||
      !isNonEmptyString(candidate.displayName) ||
      !isNonEmptyString(candidate.scientificName)
    ) {
      return [];
    }
    return [
      {
        colId: candidate.colId,
        displayName: candidate.displayName,
        scientificName: candidate.scientificName,
        rank: isNonEmptyString(candidate.rank) ? candidate.rank : null,
        acceptedName: isNonEmptyString(candidate.acceptedName)
          ? candidate.acceptedName
          : null,
      },
    ];
  });
}

export function isColIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,64}$/u.test(value);
}

/**
 * Keeps only the row shape the picker renders. Anything else a response could
 * carry — a source, a status, an owner, coordinates — is dropped here, so the
 * picker state never holds more than an id, names, a kind and a path.
 */
export function parseCatalogTypeaheadResponse(
  value: unknown,
): FirstEntryCatalogSelection[] {
  if (!value || typeof value !== "object") return [];

  const suggestions = (value as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions)) return [];

  return suggestions.flatMap((suggestion) => {
    if (!suggestion || typeof suggestion !== "object") return [];

    const candidate = suggestion as Partial<FirstEntryCatalogSelection>;
    if (
      !isUuid(candidate.id) ||
      typeof candidate.displayName !== "string" ||
      candidate.displayName.trim().length === 0 ||
      !isCatalogPickerKind(candidate.kind)
    ) {
      return [];
    }

    const row: FirstEntryCatalogSelection = {
      id: candidate.id,
      displayName: candidate.displayName,
      kind: candidate.kind,
    };
    if (isNonEmptyString(candidate.matchedName)) {
      row.matchedName = candidate.matchedName;
    }
    if (isNonEmptyString(candidate.parentDisplayName)) {
      row.parentDisplayName = candidate.parentDisplayName;
    }
    if (isPublicPath(candidate.publicPath)) {
      row.publicPath = candidate.publicPath;
    }
    return [row];
  });
}

export type CatalogTypeaheadClientState = "ready" | "empty" | "unavailable";

/**
 * The picker must never infer availability from an empty list: an empty
 * `ready` answer and a route that failed look identical there. The server
 * says which it is, and anything unrecognised reads as unavailable, which
 * offers the own-name outcome alone rather than claiming the catalog is
 * empty.
 */
export function parseCatalogTypeaheadState(
  value: unknown,
): CatalogTypeaheadClientState {
  if (!value || typeof value !== "object") return "unavailable";
  const state = (value as { state?: unknown }).state;
  if (state === "ready" || state === "empty") return state;
  return "unavailable";
}

export function catalogItemIdForSelection(
  selection: CatalogPickerSelection | null,
) {
  return selection?.kind === "item" ? selection.row.id : null;
}

export function catalogLabelForSelection(
  selection: CatalogPickerSelection | null,
) {
  return selection?.kind === "own_name" ? selection.name : null;
}

export function isCatalogPickerKind(value: unknown): value is CatalogPickerKind {
  return value === "species" || value === "cultivar" || value === "breed";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPublicPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    value.length <= 200
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
