import { createHash } from "node:crypto";

import {
  catalogSuggestionTrustMetadata,
  type CatalogTrustMetadata,
} from "@/lib/garden/catalog-trust";
import {
  isOve330ServeClass,
  type Ove330ServeClass,
} from "@/lib/media/presentation-contract";

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
  "sourceSnapshotId",
  "sourceRecordId",
  "sourceRecordKey",
  "sourceIds",
  "source_ids",
  "sourceId",
  "source_id",
  "colId",
  "col_id",
  "wfoId",
  "wfo_id",
  "gbifTaxonKey",
  "gbif_taxon_key",
  "eppoCode",
  "eppo_code",
  "wikidataId",
  "wikidata_id",
  "vboId",
  "vbo_id",
  "dadIsRef",
  "dad_is_ref",
  "efabisRef",
  "efabis_ref",
  "officialBeeRef",
  "official_bee_ref",
  "manualSeedProvenance",
  "manual_seed_provenance",
  "internalValidation",
  "internal_validation",
  "latinNameDispute",
  "latin_name_dispute",
  "restrictedBreedFields",
  "restricted_breed_fields",
  "euPvpVarietyId",
  "eu_pvp_variety_id",
  "nationalId",
  "national_id",
  "parserConfidence",
  "parser_confidence",
  "legalStatus",
  "legal_status",
  "legalValueCaveat",
  "legal_value_caveat",
  "sourceDocument",
  "source_document",
  "sourcePageReference",
  "source_page_reference",
  "sourceRowReference",
  "source_row_reference",
  "ojCitation",
  "oj_citation",
  "ojUrl",
  "oj_url",
  "publicationDate",
  "publication_date",
  "extractionVersion",
  "extraction_version",
  "normalizedByOverGardenCaveat",
  "normalized_by_overgarden_caveat",
  "notifierCode",
  "notifier_code",
  "countryCode",
  "country_code",
  "admissionAction",
  "admission_action",
  "marketExtensionDate",
  "market_extension_date",
  "registerType",
  "register_type",
  "artifactChecksumSha256",
  "artifact_checksum_sha256",
  "statusReasons",
  "status_reasons",
  "iasasPdfReference",
  "iasas_pdf_reference",
  "iasasParserBlocker",
  "iasas_parser_blocker",
  "accessionIdentifier",
  "accession_identifier",
  "accessionRecordUrl",
  "accession_record_url",
  "candidateKind",
  "candidate_kind",
  "reviewStatus",
  "review_status",
  "curatorDecision",
  "curator_decision",
  "improvementLevel",
  "improvement_level",
  "germplasmDistributionPolicy",
  "germplasm_distribution_policy",
  "genesysEuriscoBlocker",
  "genesys_eurisco_blocker",
  "redistributionRestriction",
  "redistribution_restriction",
  "antiCompeteTerms",
  "anti_compete_terms",
  "sourceOnlyFields",
  "source_only_fields",
  "rawPayload",
  "raw_payload",
  "rawPayloadSha256",
  "raw_payload_sha256",
  "payloadSha256",
  "payload_sha256",
  "allowedProjection",
  "allowed_projection",
  "allowedUsage",
  "allowed_usage",
  "parserVersion",
  "parser_version",
  "catalogAliasProjectionId",
  "catalog_alias_projection_id",
  "aliasStatus",
  "alias_status",
  "aliasKind",
  "alias_kind",
  "sourceName",
  "source_name",
  "sourceUrl",
  "source_url",
  "sourceVersion",
  "source_version",
  "sourceMethod",
  "source_method",
  "confidence",
  "license",
  "licenseUrl",
  "license_url",
  "attributionRequired",
  "attribution_required",
  "attributionText",
  "attribution_text",
  "sourceCredits",
  "source_credits",
  "projectionNotes",
  "projection_notes",
];

export type CatalogTypeaheadStatus =
  (typeof SELECTABLE_CATALOG_STATUSES)[number];
export type CatalogTypeaheadCatalogKind = "plant_variety" | "species" | "breed";

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

export interface CatalogTypeaheadSuggestion extends Partial<CatalogTrustMetadata> {
  id: string;
  displayName: string;
  canonicalName: string;
  locale: string;
  status: CatalogTypeaheadStatus;
  source: string;
  catalogKind: CatalogTypeaheadCatalogKind;
  serveClass?: Ove330ServeClass;
}

export const SOURCE_BACKED_CONCEPT_DEDUPE_SOURCE_VALUES = [
  "ua_state_register",
  "species_backbone",
  "ua_official_bee_breed",
  "vertebrate_breed_ontology",
  "eu_common_catalogue_bg",
  "eu_oj_eur_lex_common_catalogue",
  "grin_genebank_candidate",
] as const;

const SOURCE_BACKED_CONCEPT_DEDUPE_SOURCES = new Set<string>(
  SOURCE_BACKED_CONCEPT_DEDUPE_SOURCE_VALUES,
);

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
  const catalogKind = stringValue(hit.catalogKind);
  const serveClass = isOve330ServeClass(hit.serveClass)
    ? hit.serveClass
    : "exact";

  if (
    !catalogItemId ||
    !displayName ||
    !canonicalName ||
    !locale ||
    !status ||
    !isCatalogTypeaheadStatus(status) ||
    !source ||
    !catalogKind ||
    !isCatalogTypeaheadCatalogKind(catalogKind)
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
    catalogKind,
    serveClass,
    ...catalogSuggestionTrustMetadata({
      status,
      source,
      catalogKind,
      locale,
    }),
  };
}

export function dedupeCatalogTypeaheadSuggestions<
  T extends CatalogTypeaheadSuggestion,
>(suggestions: T[]): T[] {
  const deduped = new Map<string, T>();

  for (const suggestion of suggestions) {
    const key = catalogTypeaheadSuggestionDedupeKey(suggestion);
    if (deduped.has(key)) continue;
    deduped.set(key, suggestion);
  }

  return [...deduped.values()];
}

export function catalogTypeaheadSuggestionDedupeKey(
  suggestion: CatalogTypeaheadSuggestion,
) {
  if (SOURCE_BACKED_CONCEPT_DEDUPE_SOURCES.has(suggestion.source)) {
    const normalizedCanonicalName = normalizeTypeaheadText(
      suggestion.canonicalName,
    );

    if (normalizedCanonicalName) {
      return [
        "source-backed-concept",
        suggestion.source,
        suggestion.catalogKind,
        normalizedCanonicalName,
      ].join(":");
    }
  }

  return `catalog-item:${suggestion.id}`;
}

function catalogTypeaheadDocumentId(
  catalogItemId: string,
  locale: string,
  normalizedName: string,
) {
  const aliasDigest = createHash("sha256")
    .update(`${locale}\0${normalizedName}`)
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

function hasForbiddenTypeaheadKeys(hit: Record<string, unknown>) {
  return FORBIDDEN_TYPEAHEAD_HIT_KEYS.some((key) => key in hit);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
