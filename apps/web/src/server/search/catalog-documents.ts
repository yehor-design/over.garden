export const CATALOG_TYPEAHEAD_INDEX = "catalog_typeahead";

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;
const FORBIDDEN_TYPEAHEAD_HIT_KEYS = [
  "ownerUserId",
  "owner_user_id",
  "createdByUserId",
  "created_by_user_id",
  "journalText",
  "journalTitle",
  "journalBody",
  "rawAnalytics",
  "analyticsPayload",
  "email",
  "ip",
  "ipAddress",
  "userAgent",
  "location",
  "preciseLocation",
  "address",
  "coordinates",
  "latitude",
  "longitude",
  "gps",
  "mediaMetadata",
  "exif",
  "exifGps",
  "quarantineKey",
];

export type CatalogTypeaheadStatus =
  (typeof SELECTABLE_CATALOG_STATUSES)[number];

export interface CatalogTypeaheadRow {
  id: string;
  canonicalName: string;
  normalizedName: string | null;
  status: string;
  source: string;
  createdByUserId: string | null;
  itemLocale: string;
  displayName: string;
  aliasNormalizedName: string;
  aliasLocale: string;
  isPrimary: boolean;
}

export interface CatalogTypeaheadDocument {
  id: string;
  catalogItemId: string;
  displayName: string;
  canonicalName: string;
  normalizedName: string;
  locale: string;
  itemLocale: string;
  status: CatalogTypeaheadStatus;
  source: string;
  isPrimary: boolean;
  rank: number;
  kind: "catalog_item";
}

export interface CatalogTypeaheadSuggestion {
  id: string;
  displayName: string;
  canonicalName: string;
  locale: string;
  status: CatalogTypeaheadStatus;
  source: string;
}

export function toCatalogTypeaheadDocument(
  row: CatalogTypeaheadRow,
): CatalogTypeaheadDocument | null {
  if (!isCatalogTypeaheadStatus(row.status)) return null;
  if (row.createdByUserId !== null) return null;

  const normalizedName = normalizeTypeaheadText(
    row.aliasNormalizedName || row.displayName,
  );
  if (!row.id || !row.displayName || !row.canonicalName || !normalizedName) {
    return null;
  }

  return {
    id: catalogTypeaheadDocumentId(row.id, row.aliasLocale, normalizedName),
    catalogItemId: row.id,
    displayName: row.displayName,
    canonicalName: row.canonicalName,
    normalizedName,
    locale: row.aliasLocale,
    itemLocale: row.itemLocale,
    status: row.status,
    source: row.source,
    isPrimary: row.isPrimary,
    rank: row.isPrimary ? 0 : 10,
    kind: "catalog_item",
  };
}

export function catalogTypeaheadHitToSuggestion(
  hit: unknown,
): CatalogTypeaheadSuggestion | null {
  if (!isRecord(hit)) return null;
  if (hasForbiddenTypeaheadKeys(hit)) return null;

  const catalogItemId = stringValue(hit.catalogItemId);
  const displayName = stringValue(hit.displayName);
  const canonicalName = stringValue(hit.canonicalName);
  const locale = stringValue(hit.locale);
  const status = stringValue(hit.status);
  const source = stringValue(hit.source);

  if (
    !catalogItemId ||
    !displayName ||
    !canonicalName ||
    !locale ||
    !status ||
    !isCatalogTypeaheadStatus(status) ||
    !source
  ) {
    return null;
  }

  return {
    id: catalogItemId,
    displayName,
    canonicalName,
    locale,
    status,
    source,
  };
}

export function dedupeCatalogTypeaheadSuggestions(
  suggestions: CatalogTypeaheadSuggestion[],
): CatalogTypeaheadSuggestion[] {
  const deduped = new Map<string, CatalogTypeaheadSuggestion>();

  for (const suggestion of suggestions) {
    if (deduped.has(suggestion.id)) continue;
    deduped.set(suggestion.id, suggestion);
  }

  return [...deduped.values()];
}

function catalogTypeaheadDocumentId(
  catalogItemId: string,
  locale: string,
  normalizedName: string,
) {
  return `${catalogItemId}:${encodeURIComponent(locale)}:${encodeURIComponent(
    normalizedName,
  )}`;
}

function normalizeTypeaheadText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isCatalogTypeaheadStatus(
  value: string,
): value is CatalogTypeaheadStatus {
  return SELECTABLE_CATALOG_STATUSES.includes(value as CatalogTypeaheadStatus);
}

function hasForbiddenTypeaheadKeys(hit: Record<string, unknown>) {
  return FORBIDDEN_TYPEAHEAD_HIT_KEYS.some((key) => key in hit);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
