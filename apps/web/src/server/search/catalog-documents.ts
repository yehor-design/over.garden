import { createHash } from "node:crypto";

export const CATALOG_TYPEAHEAD_INDEX = "catalog_typeahead";

const SELECTABLE_CATALOG_STATUSES = ["seeded", "confirmed"] as const;

export type CatalogTypeaheadStatus =
  (typeof SELECTABLE_CATALOG_STATUSES)[number];
export type CatalogTypeaheadCatalogKind = "plant_variety" | "species" | "breed";
export type CatalogTypeaheadObjectKind = "plant" | "animal";

export interface CatalogTypeaheadRow {
  id: string;
  canonicalName: string;
  normalizedName: string | null;
  catalogKind: string;
  status: string;
  source: string;
  createdByUserId: string | null;
  itemLocale: string;
  displayName: string;
  aliasNormalizedName: string;
  aliasLocale: string;
  isPrimary: boolean;
  isGeneratedAlias?: boolean;
}

/**
 * Sources whose duplicate rows the entity-resolution QA compares by concept;
 * the picker no longer dedupes by source (one row per organism, ADR-0026 D7).
 */
export const SOURCE_BACKED_CONCEPT_DEDUPE_SOURCE_VALUES = [
  "ua_state_register",
  "species_backbone",
  "ua_official_bee_breed",
  "vertebrate_breed_ontology",
  "eu_common_catalogue_bg",
  "eu_oj_eur_lex_common_catalogue",
  "grin_genebank_candidate",
] as const;

export interface CatalogTypeaheadDocument {
  id: string;
  catalogItemId: string;
  displayName: string;
  canonicalName: string;
  normalizedName: string;
  catalogKind: CatalogTypeaheadCatalogKind;
  locale: string;
  itemLocale: string;
  status: CatalogTypeaheadStatus;
  source: string;
  isPrimary: boolean;
  rank: number;
  kind: "catalog_item";
  serveClass: "exact" | "generated";
}

export function toCatalogTypeaheadDocument(
  row: CatalogTypeaheadRow,
): CatalogTypeaheadDocument | null {
  if (!isCatalogTypeaheadStatus(row.status)) return null;
  if (!isCatalogTypeaheadCatalogKind(row.catalogKind)) return null;
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
    catalogKind: row.catalogKind,
    locale: row.aliasLocale,
    itemLocale: row.itemLocale,
    status: row.status,
    source: row.source,
    isPrimary: row.isPrimary,
    rank: row.isPrimary ? 0 : 10,
    kind: "catalog_item",
    serveClass: row.isGeneratedAlias ? "generated" : "exact",
  };
}

function catalogTypeaheadDocumentId(
  catalogItemId: string,
  locale: string,
  normalizedName: string,
) {
  const aliasKey = `${locale}\0${normalizedName}`;
  const aliasDigest = createHash("sha256")
    .update(aliasKey)
    .digest("hex")
    .slice(0, 24);
  return `${catalogItemId}-${aliasDigest}`;
}

function normalizeTypeaheadText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isCatalogTypeaheadStatus(
  value: string,
): value is CatalogTypeaheadStatus {
  return SELECTABLE_CATALOG_STATUSES.includes(value as CatalogTypeaheadStatus);
}

function isCatalogTypeaheadCatalogKind(
  value: string,
): value is CatalogTypeaheadCatalogKind {
  return value === "plant_variety" || value === "species" || value === "breed";
}
