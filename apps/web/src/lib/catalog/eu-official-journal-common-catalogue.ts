import { createHash } from "node:crypto";

import type { JsonValue } from "@/db/schema";
import {
  EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
  type EuCommonCatalogueParsedRow,
  type EuCommonCatalogueParserResult,
} from "./eu-common-catalogue-parser";

export const EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE =
  "eu_oj_eur_lex_common_catalogue" as const;

export const EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION =
  "ove103-eu-oj-product-projection-v1" as const;

export const EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_LEGAL_VALUE_CAVEAT =
  "The EU Plant Variety Portal is information-only and has no legal value; the legally binding Common Catalogue source is the Official Journal of the European Union." as const;

export const EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_NORMALIZATION_CAVEAT =
  "OverGarden normalizes denominations for lookup only; it does not certify registration status or replace the Official Journal source." as const;

export const EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE = {
  slug: "eu-oj-eur-lex-common-catalogue",
  name: "EU Official Journal / EUR-Lex Common Catalogue",
  category: "official_varieties",
  license:
    "EUR-Lex legal-document reuse policy; verify document-specific conditions.",
  licenseUrl:
    "https://eur-lex.europa.eu/content/legal-notice/legal-notice.html",
  attributionRequired: true,
  attributionText:
    "European Union, Official Journal of the European Union / EUR-Lex, Common Catalogue. source-backed row normalized by OverGarden; the EU Plant Variety Portal has no legal value.",
  allowedUsage: ["raw_snapshot", "canonical_product_projection"],
} as const;

export interface EuOfficialJournalCommonCatalogueProjection {
  canonicalName: string;
  normalizedName: string;
  publicSlug: string;
  status: "seeded";
  source: typeof EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE;
  sourceId: string;
  catalogKind: "plant_variety";
  locale: "en";
  aliases: Array<{
    displayName: string;
    normalizedName: string;
    locale: "en";
    isPrimary: boolean;
  }>;
  provenance: {
    sourceAttribution: string;
    sourceVersion: string;
    sourceUrl: string;
    ojCitation: string | null;
    publicationDate: string | null;
    extractionVersion: typeof EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION;
    parserVersion: string;
    normalizedByOverGardenCaveat: typeof EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_NORMALIZATION_CAVEAT;
    legalValueCaveat: typeof EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_LEGAL_VALUE_CAVEAT;
  };
}

export interface EuOfficialJournalCommonCatalogueSourceRecordDefinition {
  id: string;
  rawPayload: JsonValue;
  sourceOnlyFields: JsonValue;
  allowedProjection: JsonValue;
  projectionStatus: "projected" | "quarantined" | "rejected";
  projection: EuOfficialJournalCommonCatalogueProjection | null;
}

export interface EuOfficialJournalCommonCatalogueSnapshotDefinition {
  source: typeof EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE & {
    version: string;
    url: string;
    publicationDate: string | null;
    ojCitation: string | null;
    artifactChecksumSha256: string;
    fetchedAt: Date | string;
    verifiedAt: Date | string;
  };
  records: EuOfficialJournalCommonCatalogueSourceRecordDefinition[];
}

export interface EuOfficialJournalCommonCatalogueImportDefinition {
  sourceSlug: typeof EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug;
  parserVersion: typeof EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION;
  extractionVersion: typeof EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION;
  snapshots: EuOfficialJournalCommonCatalogueSnapshotDefinition[];
}

export function euOfficialJournalCommonCatalogueDefinitionFromParserResults(input: {
  parserResults: readonly EuCommonCatalogueParserResult[];
  fetchedAt?: Date | string;
  verifiedAt?: Date | string;
}): EuOfficialJournalCommonCatalogueImportDefinition {
  return euOfficialJournalCommonCatalogueDefinitionFromRows({
    rows: input.parserResults.flatMap((result) => result.rows),
    fetchedAt: input.fetchedAt,
    verifiedAt: input.verifiedAt,
  });
}

export function euOfficialJournalCommonCatalogueDefinitionFromRows(input: {
  rows: readonly EuCommonCatalogueParsedRow[];
  fetchedAt?: Date | string;
  verifiedAt?: Date | string;
}): EuOfficialJournalCommonCatalogueImportDefinition {
  const now = new Date().toISOString();
  const fetchedAt = input.fetchedAt ?? now;
  const verifiedAt = input.verifiedAt ?? now;
  const grouped = groupRowsBySnapshot(input.rows);

  return {
    sourceSlug: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
    parserVersion: EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
    extractionVersion: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION,
    snapshots: [...grouped.values()].map((rows) => {
      const firstRow = rows[0];
      if (!firstRow) {
        throw new Error("EU OJ Common Catalogue snapshot has no rows.");
      }

      const version = buildSourceVersion(firstRow);
      const records = rows.map((row) =>
        buildEuOfficialJournalCommonCatalogueSourceRecord(row),
      );

      return {
        source: {
          ...EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE,
          version,
          url: firstRow.sourceUrl,
          publicationDate: firstRow.publicationDate,
          ojCitation: firstRow.ojCitation,
          artifactChecksumSha256: firstRow.artifactChecksumSha256,
          fetchedAt,
          verifiedAt,
        },
        records,
      };
    }),
  };
}

export function euOfficialJournalCommonCatalogueSnapshotChecksum(
  snapshot: EuOfficialJournalCommonCatalogueSnapshotDefinition,
) {
  return sha256Hex(
    stableJsonStringify(
      jsonValue({
        source: {
          slug: snapshot.source.slug,
          name: snapshot.source.name,
          category: snapshot.source.category,
          version: snapshot.source.version,
          url: snapshot.source.url,
          license: snapshot.source.license,
          licenseUrl: snapshot.source.licenseUrl,
          attributionRequired: snapshot.source.attributionRequired,
          attributionText: snapshot.source.attributionText,
          allowedUsage: snapshot.source.allowedUsage,
          publicationDate: snapshot.source.publicationDate,
          ojCitation: snapshot.source.ojCitation,
          artifactChecksumSha256: snapshot.source.artifactChecksumSha256,
        },
        records: snapshot.records.map((record) => record.rawPayload),
      }),
    ),
  );
}

export function euOfficialJournalCommonCataloguePayloadChecksum(
  record: EuOfficialJournalCommonCatalogueSourceRecordDefinition,
) {
  return sha256Hex(stableJsonStringify(record.rawPayload));
}

export function euOfficialJournalCommonCatalogueAllowedUsage(): JsonValue {
  return jsonValue(EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.allowedUsage);
}

export function stableJsonStringify(value: JsonValue): string {
  return JSON.stringify(sortJsonValue(value));
}

function buildEuOfficialJournalCommonCatalogueSourceRecord(
  row: EuCommonCatalogueParsedRow,
): EuOfficialJournalCommonCatalogueSourceRecordDefinition {
  const sourceRecordKey = buildSourceRecordKey(row);
  const projection = buildProjection(row, sourceRecordKey);
  const projectionStatus = projection
    ? "projected"
    : row.confidenceBucket === "rejected"
      ? "rejected"
      : "quarantined";
  const blockedReason = projection
    ? null
    : row.confidenceBucket === "accepted"
      ? "Accepted parser row is missing product-safe required projection fields or exceeds product field limits."
      : "Parser row is not accepted; review-needed and rejected rows remain source-only.";

  return {
    id: sourceRecordKey,
    rawPayload: jsonValue({
      sourceFamily: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
      row,
    }),
    sourceOnlyFields: jsonValue({
      parser: {
        extractionConfidence: row.extractionConfidence,
        confidenceBucket: row.confidenceBucket,
        statusReasons: row.statusReasons,
        notifierCode: row.notifierCode,
        countryCode: row.countryCode,
        admissionAction: row.admissionAction,
        marketExtensionDate: row.marketExtensionDate,
        registerType: row.registerType,
      },
      legalSource: {
        sourceUrl: row.sourceUrl,
        ojCitation: row.ojCitation,
        publicationDate: row.publicationDate,
        artifactChecksumSha256: row.artifactChecksumSha256,
        legalValueCaveat:
          EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_LEGAL_VALUE_CAVEAT,
      },
      blockedReason,
    }),
    allowedProjection: projection
      ? jsonValue(projection)
      : jsonValue({
          confidenceBucket: row.confidenceBucket,
          projectionStatus,
          parserVersion: row.parserVersion,
          extractionVersion:
            EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION,
          reason: blockedReason,
        }),
    projectionStatus,
    projection,
  };
}

function buildProjection(
  row: EuCommonCatalogueParsedRow,
  sourceRecordKey: string,
): EuOfficialJournalCommonCatalogueProjection | null {
  if (row.confidenceBucket !== "accepted") return null;
  if (!isOfficialEuOjSourceUrl(row.sourceUrl)) return null;

  const canonicalName = normalizeDisplayName(row.varietyDenomination);
  const normalizedName = canonicalName ? normalizeName(canonicalName) : null;
  if (!canonicalName || !normalizedName) return null;
  if (
    !isProductFieldLength(canonicalName) ||
    !isProductFieldLength(normalizedName)
  ) {
    return null;
  }

  return {
    canonicalName,
    normalizedName,
    publicSlug: buildPublicSlug(canonicalName, sourceRecordKey),
    status: "seeded",
    source: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
    sourceId: sourceRecordKey,
    catalogKind: "plant_variety",
    locale: "en",
    aliases: [
      {
        displayName: canonicalName,
        normalizedName,
        locale: "en",
        isPrimary: true,
      },
    ],
    provenance: {
      sourceAttribution:
        EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.attributionText,
      sourceVersion: buildSourceVersion(row),
      sourceUrl: row.sourceUrl,
      ojCitation: row.ojCitation,
      publicationDate: row.publicationDate,
      extractionVersion:
        EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_EXTRACTION_VERSION,
      parserVersion: row.parserVersion,
      normalizedByOverGardenCaveat:
        EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_NORMALIZATION_CAVEAT,
      legalValueCaveat: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_LEGAL_VALUE_CAVEAT,
    },
  };
}

function groupRowsBySnapshot(rows: readonly EuCommonCatalogueParsedRow[]) {
  const grouped = new Map<string, EuCommonCatalogueParsedRow[]>();
  for (const row of rows) {
    const key = [
      row.sourceUrl,
      row.artifactChecksumSha256,
      row.supplementType,
      row.publicationDate ?? "undated",
    ].join(":");
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function buildSourceVersion(row: EuCommonCatalogueParsedRow) {
  return [
    extractEliDocumentKey(row.sourceUrl),
    row.supplementType,
    row.publicationDate ?? "undated",
  ].join(":");
}

function buildSourceRecordKey(row: EuCommonCatalogueParsedRow) {
  const prefix = sourceRecordKeyPrefix(row.sourceUrl);
  const rowHash = sha256Hex(
    stableJsonStringify(
      jsonValue({
        sourceUrl: row.sourceUrl,
        supplementType: row.supplementType,
        varietyDenomination: row.varietyDenomination,
        speciesOrCrop: row.speciesOrCrop,
        notifierCode: row.notifierCode,
        admissionAction: row.admissionAction,
        publicationDate: row.publicationDate,
      }),
    ),
  ).slice(0, 16);

  return `${prefix}row:${rowHash}`;
}

function sourceRecordKeyPrefix(sourceUrl: string) {
  const eliKey = extractEliDocumentKey(sourceUrl);
  if (sourceUrl.startsWith("https://eur-lex.europa.eu/eli/")) {
    return `EUR-Lex:ELI:${eliKey}:`;
  }
  if (
    sourceUrl.startsWith("https://data.europa.eu/eli/") ||
    sourceUrl.startsWith("http://data.europa.eu/eli/")
  ) {
    return `data.europa.eu:ELI:${eliKey}:`;
  }

  throw new Error(
    "EU OJ Common Catalogue projection requires an official EUR-Lex or data.europa.eu ELI source URL.",
  );
}

function extractEliDocumentKey(sourceUrl: string) {
  const match = sourceUrl.match(/\/eli\/([^?#]+?)\/oj(?:[/?#]|$)/);
  if (!match?.[1]) {
    throw new Error(`Unsupported EU OJ ELI source URL: ${sourceUrl}`);
  }
  return match[1].replace(/\/$/, "");
}

function isOfficialEuOjSourceUrl(sourceUrl: string) {
  return (
    sourceUrl.startsWith("https://eur-lex.europa.eu/eli/") ||
    sourceUrl.startsWith("https://data.europa.eu/eli/") ||
    sourceUrl.startsWith("http://data.europa.eu/eli/")
  );
}

function buildPublicSlug(canonicalName: string, sourceRecordKey: string) {
  const base = slugify(canonicalName);
  const hash = sha256Hex(sourceRecordKey).slice(0, 10);
  return `eu-oj-${base || "variety"}-${hash}`.slice(0, 96).replace(/-+$/, "");
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function normalizeDisplayName(value: string | null) {
  return value?.trim().replace(/\s+/g, " ") ?? null;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isProductFieldLength(value: string) {
  return value.length >= 1 && value.length <= 120;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonValue<T>(value: T): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested as JsonValue)]),
    ) as JsonValue;
  }

  return value;
}
