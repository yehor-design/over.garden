import { createHash } from "node:crypto";

import type { JsonValue } from "@/db/schema";

export const BG_OFFICIAL_VARIETY_PARSER_VERSION =
  "ove-61.bg-official-variety.proof.v1";

export const EU_COMMON_CATALOGUE_BG_SOURCE = {
  slug: "eu-common-catalogue",
  name: "EU Plant Variety Portal Bulgarian official variety proof subset",
  category: "official_varieties",
  version: "2026-06-30-bg-proof-subset",
  url: "https://ec.europa.eu/food/plant-variety-portal/",
  license:
    "European Commission reuse policy with source acknowledgement; EU Plant Variety Portal information-only caveat applies.",
  licenseUrl: "https://commission.europa.eu/legal-notice_en",
  attributionRequired: true,
  attributionText:
    "European Commission, EU Plant Variety Portal. Portal information is for information purposes only and has no legal value.",
  allowedUsage: ["raw_snapshot", "canonical_product_projection", "manual_seed"],
} as const;

export const BG_OFFICIAL_VARIETY_SOURCE_PROOF = {
  sourceDocument:
    "EU Plant Variety Portal legal page and IASAS BG 2026 official-variety-list page",
  sourceVersion:
    "EU Plant Variety Portal live HTML verified 2026-06-30; IASAS 2026 OSL page links OSL 1/2 PDF files",
  sourcePageReference:
    "EU PVP legal page; IASAS /cms/2026 official list page; proof subset is maintained as one reviewed row until a stable export/parser path is approved.",
  sourceRowReference:
    "BG proof row: country/org BG; denomination Sadovo 1; common wheat official-variety proof subset",
  liveProof: {
    euPortalUrl: "https://ec.europa.eu/food/plant-variety-portal/",
    euLegalUrl:
      "https://ec.europa.eu/food/plant-variety-portal/cat_legal.xhtml",
    iasasOfficialListUrl: "https://iasas.government.bg/cms/2026",
    iasasPdfUrl: "https://iasas.government.bg/att/OSL%201%20-%202026%208.pdf",
    iasasPdfSha256:
      "428febd9e82b97b28e4f0706a4cc519fde0975617f8c3f038cbdb397876a120c",
    iasasPdfByteLength: 4716785,
    iasasPdfLastModified: "2026-06-26T12:14:05.000Z",
    euNoLegalValueCaveat:
      "EU Plant Variety Portal is made available for information purposes only and has no legal value.",
    iasasParserBlocker:
      "IASAS current official list is PDF-only; no stable API/CSV row export is approved for bulk projection.",
  },
  fetchedAt: "2026-06-30T00:00:00.000Z",
  verifiedAt: "2026-06-30T00:00:00.000Z",
} as const;

export const BG_OFFICIAL_VARIETY_SOURCE_ROWS = [
  {
    id: "EU-PVP:BG:SADOVO-1",
    countryCode: "BG",
    countryName: "Bulgaria",
    denomination: "Садово 1",
    euDenomination: "Sadovo 1",
    speciesName: "Triticum aestivum L.",
    speciesCommonName: "Common wheat",
    nationalId: "BG-SADOVO-1-OVE61-PROOF",
    registerSubType: "Agricultural species",
    varietyStatus: "Registered",
    parserConfidence: 0.9825,
    reviewStatus: "accepted",
    legalStatus: "cleared_for_ove61_projection",
    projectionStatus: "projected",
    sourcePageReference:
      "EU Plant Variety Portal result table schema and IASAS 2026 official list document proof.",
    sourceRowReference:
      "Country / Org BG; Denomination Sadovo 1; National ID BG-SADOVO-1-OVE61-PROOF.",
  },
  {
    id: "IASAS-OSL-2026:PDF:LOW-CONFIDENCE-ROW",
    countryCode: "BG",
    countryName: "Bulgaria",
    denomination: "Куртовска капия",
    euDenomination: "Kurtovska kapia",
    speciesName: "Capsicum annuum L.",
    speciesCommonName: "Pepper",
    nationalId: "IASAS-PDF-LOW-CONFIDENCE-OVE61",
    registerSubType: "Vegetable species",
    varietyStatus: "parser_review_needed",
    parserConfidence: 0.6125,
    reviewStatus: "review_needed",
    legalStatus: "iasas_reuse_condition_pending",
    projectionStatus: "quarantined",
    sourcePageReference:
      "IASAS 2026 OSL PDF text extraction requires curator/parser review.",
    sourceRowReference:
      "Held as parser-confidence gate proof; not projected to typeahead.",
  },
] as const;

export interface BgOfficialVarietyProjection {
  canonicalName: string;
  normalizedName: string;
  publicSlug: string;
  status: "seeded";
  source: "eu_common_catalogue_bg";
  sourceId: string;
  catalogKind: "plant_variety";
  locale: "bg";
  aliases: Array<{
    displayName: string;
    normalizedName: string;
    locale: string;
    isPrimary: boolean;
  }>;
  provenance: {
    sourceDocument: string;
    sourceVersion: string;
    sourcePageReference: string;
    sourceRowReference: string;
    parserConfidence: number;
    legalStatus: string;
    attributionRequirement: string;
  };
}

export type BgOfficialVarietySourceRow =
  (typeof BG_OFFICIAL_VARIETY_SOURCE_ROWS)[number];

export interface BgOfficialVarietySourceRecordDefinition {
  id: string;
  rawPayload: JsonValue;
  sourceOnlyFields: JsonValue;
  allowedProjection: JsonValue;
  projectionStatus: "projected" | "quarantined";
}

export interface BgOfficialVarietyImportDefinition {
  source: typeof EU_COMMON_CATALOGUE_BG_SOURCE;
  fileProof: typeof BG_OFFICIAL_VARIETY_SOURCE_PROOF;
  records: BgOfficialVarietySourceRecordDefinition[];
  projection: BgOfficialVarietyProjection;
  blockedRecordKey: string;
}

export function bgOfficialVarietyDefinition(): BgOfficialVarietyImportDefinition {
  const acceptedRow = BG_OFFICIAL_VARIETY_SOURCE_ROWS[0];
  const blockedRow = BG_OFFICIAL_VARIETY_SOURCE_ROWS[1];
  const projection = buildBgOfficialVarietyProjection(acceptedRow);

  return {
    source: EU_COMMON_CATALOGUE_BG_SOURCE,
    fileProof: BG_OFFICIAL_VARIETY_SOURCE_PROOF,
    records: BG_OFFICIAL_VARIETY_SOURCE_ROWS.map((row) =>
      buildBgOfficialVarietySourceRecord(row, projection),
    ),
    projection,
    blockedRecordKey: blockedRow.id,
  };
}

export function bgOfficialVarietySnapshotChecksum(
  definition = bgOfficialVarietyDefinition(),
) {
  return sha256Hex(stableJsonStringify(definition.fileProof));
}

export function bgOfficialVarietyPayloadChecksum(
  record: BgOfficialVarietySourceRecordDefinition,
) {
  return sha256Hex(stableJsonStringify(record.rawPayload));
}

export function bgOfficialVarietyAllowedProjection(
  definition = bgOfficialVarietyDefinition(),
): BgOfficialVarietyProjection {
  return JSON.parse(
    stableJsonStringify(jsonValue(definition.projection)),
  ) as BgOfficialVarietyProjection;
}

export function bgOfficialVarietyAllowedUsage(
  definition = bgOfficialVarietyDefinition(),
): JsonValue {
  return jsonValue(definition.source.allowedUsage);
}

export function stableJsonStringify(value: JsonValue): string {
  return JSON.stringify(sortJsonValue(value));
}

function buildBgOfficialVarietyProjection(
  row: BgOfficialVarietySourceRow,
): BgOfficialVarietyProjection {
  return {
    canonicalName: row.denomination,
    normalizedName: normalizeName(row.denomination),
    publicSlug: "sadovo-1-bg-official-variety",
    status: "seeded",
    source: "eu_common_catalogue_bg",
    sourceId: row.id,
    catalogKind: "plant_variety",
    locale: "bg",
    aliases: [
      {
        displayName: row.denomination,
        normalizedName: normalizeName(row.denomination),
        locale: "bg",
        isPrimary: true,
      },
      {
        displayName: row.euDenomination,
        normalizedName: normalizeName(row.euDenomination),
        locale: "en",
        isPrimary: false,
      },
      {
        displayName: `${row.speciesCommonName} ${row.euDenomination}`,
        normalizedName: normalizeName(
          `${row.speciesCommonName} ${row.euDenomination}`,
        ),
        locale: "en",
        isPrimary: false,
      },
    ],
    provenance: {
      sourceDocument: BG_OFFICIAL_VARIETY_SOURCE_PROOF.sourceDocument,
      sourceVersion: BG_OFFICIAL_VARIETY_SOURCE_PROOF.sourceVersion,
      sourcePageReference: row.sourcePageReference,
      sourceRowReference: row.sourceRowReference,
      parserConfidence: row.parserConfidence,
      legalStatus: row.legalStatus,
      attributionRequirement: EU_COMMON_CATALOGUE_BG_SOURCE.attributionText,
    },
  };
}

function buildBgOfficialVarietySourceRecord(
  row: BgOfficialVarietySourceRow,
  projection: BgOfficialVarietyProjection,
): BgOfficialVarietySourceRecordDefinition {
  const isProjected = row.projectionStatus === "projected";

  return {
    id: row.id,
    rawPayload: jsonValue({
      sourceDocument: BG_OFFICIAL_VARIETY_SOURCE_PROOF.sourceDocument,
      sourceVersion: BG_OFFICIAL_VARIETY_SOURCE_PROOF.sourceVersion,
      liveProof: BG_OFFICIAL_VARIETY_SOURCE_PROOF.liveProof,
      row,
    }),
    sourceOnlyFields: jsonValue({
      parserAndLegalGate: {
        parserConfidence: row.parserConfidence,
        reviewStatus: row.reviewStatus,
        legalStatus: row.legalStatus,
        projectionStatus: row.projectionStatus,
        sourcePageReference: row.sourcePageReference,
        sourceRowReference: row.sourceRowReference,
      },
      blockedReason: isProjected
        ? null
        : "Low parser confidence and IASAS reuse condition keep this row out of product typeahead.",
      nonProjectedFields: {
        nationalId: row.nationalId,
        registerSubType: row.registerSubType,
        varietyStatus: row.varietyStatus,
        speciesName: row.speciesName,
      },
    }),
    allowedProjection: isProjected
      ? jsonValue(projection)
      : jsonValue({
          reviewStatus: row.reviewStatus,
          legalStatus: row.legalStatus,
          parserConfidence: row.parserConfidence,
          projectionStatus: row.projectionStatus,
          reason:
            "Review-only BG official variety row; not eligible for catalog item projection.",
        }),
    projectionStatus: row.projectionStatus,
  };
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
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
