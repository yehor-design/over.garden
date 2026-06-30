import { createHash } from "node:crypto";

import type { JsonValue } from "@/db/schema";

export const GENEBANK_LONG_TAIL_PARSER_VERSION =
  "ove-62.genebank-long-tail.proof.v1";

export const GRIN_GENEBANK_SOURCE = {
  slug: "grin-global",
  name: "USDA GRIN/NPGS long-tail accession proof subset",
  category: "genebank_accessions",
  version: "2026-06-30-ove62-proof-subset",
  url: "https://npgsweb.ars-grin.gov/gringlobal/search",
  license:
    "USDA GRIN/NPGS public-domain source metadata; germplasm distribution policy is not a product availability claim.",
  licenseUrl: "https://www.usda.gov/policies-and-links",
  attributionRequired: false,
  attributionText: null,
  allowedUsage: [
    "raw_snapshot",
    "review_queue",
    "curator_promotion",
    "canonical_product_projection",
  ],
} as const;

export const GENEBANK_LONG_TAIL_SOURCE_PROOF = {
  sourceDocument:
    "USDA GRIN-Global accession search, accession detail, and taxonomy search live surfaces",
  sourceVersion:
    "GRIN-Global 2.3.12; live pages last updated 2025-02-24 and verified 2026-06-30",
  sourcePageReference:
    "GRIN accession search is reachable and exposes accession-country filters for Ukraine and Bulgaria; proof subset remains a curated row, not a live scraper.",
  liveProof: {
    accessionSearchUrl: "https://npgsweb.ars-grin.gov/gringlobal/search",
    accessionDetailProbeUrl:
      "https://npgsweb.ars-grin.gov/gringlobal/accessiondetail?id=1",
    taxonomySearchUrl:
      "https://npgsweb.ars-grin.gov/gringlobal/taxon/taxonomysearch",
    pageTitleProofs: [
      "Search Accessions GRIN-Global",
      "Accession Detail GRIN-Global",
      "Search Taxonomy Data in GRIN-Global",
    ],
    grinGlobalVersion: "2.3.12",
    pageLastUpdated: "2025-02-24",
    accessionCountryFilters: ["BGR:245", "UKR:829"],
    distributionPolicyCaveat:
      "NPGS germplasm is not available for individual, home, or community gardening; OverGarden stores catalog identity only and does not claim germplasm availability.",
    genesysEuriscoBlocker:
      "Genesys and EURISCO remain internal-validation-only under OVE-55 because redistribution/anti-compete terms are unresolved.",
  },
  fetchedAt: "2026-06-30T00:00:00.000Z",
  verifiedAt: "2026-06-30T00:00:00.000Z",
} as const;

export const GENEBANK_LONG_TAIL_SOURCE_ROWS = [
  {
    id: "GRIN:NPGS:OVE62:RED-CHERRY-TOMATO",
    candidateKind: "accession",
    displayName: "Red Cherry",
    canonicalName: "Red Cherry tomato",
    speciesName: "Solanum lycopersicum L.",
    cropName: "Tomato",
    accessionIdentifier: "GRIN curated proof row OVE62-001",
    accessionRecordUrl: GRIN_GENEBANK_SOURCE.url,
    improvementLevel: "landrace_or_cultivar_candidate",
    reviewStatus: "candidate_review",
    legalStatus: "grin_public_domain_ove55_use",
    projectionStatus: "quarantined",
    curatorDecision: "promote_to_canonical_seed",
    sourceRowReference:
      "Curated OVE-62 GRIN/NPGS proof row: accession candidate Red Cherry; species Solanum lycopersicum L.; crop Tomato.",
    aliases: [
      { displayName: "Red Cherry", locale: "en", isPrimary: true },
      { displayName: "Red Cherry tomato", locale: "en", isPrimary: false },
      {
        displayName: "Solanum lycopersicum Red Cherry",
        locale: "la",
        isPrimary: false,
      },
    ],
  },
  {
    id: "GRIN:NPGS:OVE62:UNREVIEWED-LANDRACE",
    candidateKind: "landrace",
    displayName: "Unreviewed NPGS landrace proof row",
    canonicalName: "Unreviewed NPGS landrace proof row",
    speciesName: "Phaseolus vulgaris L.",
    cropName: "Common bean",
    accessionIdentifier: "GRIN curated proof row OVE62-REVIEW-ONLY",
    accessionRecordUrl: GRIN_GENEBANK_SOURCE.url,
    improvementLevel: "landrace",
    reviewStatus: "review_needed",
    legalStatus: "grin_public_domain_ove55_use",
    projectionStatus: "quarantined",
    curatorDecision: "hold_for_review",
    sourceRowReference:
      "Review-only OVE-62 GRIN/NPGS proof row; legal source is approved but candidate identity is not curator-promoted.",
    aliases: [
      {
        displayName: "Unreviewed NPGS landrace proof row",
        locale: "en",
        isPrimary: true,
      },
    ],
  },
] as const;

export interface GenebankLongTailProjection {
  canonicalName: string;
  normalizedName: string;
  publicSlug: string;
  status: "seeded";
  source: "grin_genebank_candidate";
  sourceId: string;
  catalogKind: "plant_variety";
  locale: "en";
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
    candidateKind: string;
    reviewStatus: string;
    legalStatus: string;
    curatorDecision: string;
    germplasmDistributionPolicy: string;
  };
}

export type GenebankLongTailSourceRow =
  (typeof GENEBANK_LONG_TAIL_SOURCE_ROWS)[number];

export interface GenebankLongTailSourceRecordDefinition {
  id: string;
  rawPayload: JsonValue;
  sourceOnlyFields: JsonValue;
  allowedProjection: JsonValue;
  projectionStatus: "quarantined";
}

export interface GenebankLongTailImportDefinition {
  source: typeof GRIN_GENEBANK_SOURCE;
  fileProof: typeof GENEBANK_LONG_TAIL_SOURCE_PROOF;
  records: GenebankLongTailSourceRecordDefinition[];
  promotion: GenebankLongTailProjection;
  promotableRecordKey: string;
  heldRecordKey: string;
}

export function genebankLongTailDefinition(): GenebankLongTailImportDefinition {
  const promotableRow = GENEBANK_LONG_TAIL_SOURCE_ROWS[0];
  const heldRow = GENEBANK_LONG_TAIL_SOURCE_ROWS[1];
  const promotion = buildGenebankLongTailProjection(promotableRow);

  return {
    source: GRIN_GENEBANK_SOURCE,
    fileProof: GENEBANK_LONG_TAIL_SOURCE_PROOF,
    records: GENEBANK_LONG_TAIL_SOURCE_ROWS.map((row) =>
      buildGenebankLongTailSourceRecord(row, promotion),
    ),
    promotion,
    promotableRecordKey: promotableRow.id,
    heldRecordKey: heldRow.id,
  };
}

export function genebankLongTailSnapshotChecksum(
  definition = genebankLongTailDefinition(),
) {
  return sha256Hex(stableJsonStringify(jsonValue(definition.fileProof)));
}

export function genebankLongTailPayloadChecksum(
  record: GenebankLongTailSourceRecordDefinition,
) {
  return sha256Hex(stableJsonStringify(record.rawPayload));
}

export function genebankLongTailAllowedUsage(
  definition = genebankLongTailDefinition(),
): JsonValue {
  return jsonValue(definition.source.allowedUsage);
}

export function genebankLongTailPromotionProjection(
  definition = genebankLongTailDefinition(),
): GenebankLongTailProjection {
  return JSON.parse(
    stableJsonStringify(jsonValue(definition.promotion)),
  ) as GenebankLongTailProjection;
}

export function stableJsonStringify(value: JsonValue): string {
  return JSON.stringify(sortJsonValue(value));
}

function buildGenebankLongTailProjection(
  row: GenebankLongTailSourceRow,
): GenebankLongTailProjection {
  return {
    canonicalName: row.canonicalName,
    normalizedName: normalizeName(row.canonicalName),
    publicSlug: "red-cherry-tomato-grin-genebank-candidate",
    status: "seeded",
    source: "grin_genebank_candidate",
    sourceId: row.id,
    catalogKind: "plant_variety",
    locale: "en",
    aliases: row.aliases.map((alias) => ({
      displayName: alias.displayName,
      normalizedName: normalizeName(alias.displayName),
      locale: alias.locale,
      isPrimary: alias.isPrimary,
    })),
    provenance: {
      sourceDocument: GENEBANK_LONG_TAIL_SOURCE_PROOF.sourceDocument,
      sourceVersion: GENEBANK_LONG_TAIL_SOURCE_PROOF.sourceVersion,
      sourcePageReference: GENEBANK_LONG_TAIL_SOURCE_PROOF.sourcePageReference,
      sourceRowReference: row.sourceRowReference,
      candidateKind: row.candidateKind,
      reviewStatus: row.reviewStatus,
      legalStatus: row.legalStatus,
      curatorDecision: row.curatorDecision,
      germplasmDistributionPolicy:
        GENEBANK_LONG_TAIL_SOURCE_PROOF.liveProof.distributionPolicyCaveat,
    },
  };
}

function buildGenebankLongTailSourceRecord(
  row: GenebankLongTailSourceRow,
  promotion: GenebankLongTailProjection,
): GenebankLongTailSourceRecordDefinition {
  const isPromotable = row.curatorDecision === "promote_to_canonical_seed";

  return {
    id: row.id,
    rawPayload: jsonValue({
      sourceDocument: GENEBANK_LONG_TAIL_SOURCE_PROOF.sourceDocument,
      sourceVersion: GENEBANK_LONG_TAIL_SOURCE_PROOF.sourceVersion,
      liveProof: GENEBANK_LONG_TAIL_SOURCE_PROOF.liveProof,
      row,
    }),
    sourceOnlyFields: jsonValue({
      accessionIdentifier: row.accessionIdentifier,
      accessionRecordUrl: row.accessionRecordUrl,
      improvementLevel: row.improvementLevel,
      speciesName: row.speciesName,
      cropName: row.cropName,
      germplasmDistributionPolicy:
        GENEBANK_LONG_TAIL_SOURCE_PROOF.liveProof.distributionPolicyCaveat,
      genesysEuriscoBlocker:
        GENEBANK_LONG_TAIL_SOURCE_PROOF.liveProof.genesysEuriscoBlocker,
    }),
    allowedProjection: isPromotable
      ? jsonValue({
          reviewQueue: {
            candidateKind: row.candidateKind,
            displayName: row.displayName,
            speciesName: row.speciesName,
            reviewStatus: row.reviewStatus,
            legalStatus: row.legalStatus,
            curatorDecision: row.curatorDecision,
            sourceRowReference: row.sourceRowReference,
          },
          promotion,
        })
      : jsonValue({
          reviewQueue: {
            candidateKind: row.candidateKind,
            displayName: row.displayName,
            speciesName: row.speciesName,
            reviewStatus: row.reviewStatus,
            legalStatus: row.legalStatus,
            curatorDecision: row.curatorDecision,
            sourceRowReference: row.sourceRowReference,
          },
          reason:
            "Candidate remains review-only; legal source is approved but this row is not curator-promoted.",
        }),
    projectionStatus: "quarantined",
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
