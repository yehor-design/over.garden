import { createHash } from "node:crypto";

import type { JsonValue } from "@/db/schema";

export const GENEBANK_LONG_TAIL_PARSER_VERSION =
  "ove-88.genebank-long-tail.bulk-proof.v1";

export const GRIN_GENEBANK_SOURCE = {
  slug: "grin-global",
  name: "USDA GRIN/NPGS long-tail accession proof subset",
  category: "genebank_accessions",
  version: "2026-07-02-ove88-bulk-proof-subset",
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
    id: "GRIN:NPGS:OVE88:BULGARIAN-CARROT-PEPPER",
    candidateKind: "accession",
    displayName: "Bulgarian Carrot",
    canonicalName: "Bulgarian Carrot pepper",
    speciesName: "Capsicum annuum L.",
    cropName: "Pepper",
    accessionIdentifier: "GRIN curated proof row OVE88-001",
    accessionRecordUrl: GRIN_GENEBANK_SOURCE.url,
    improvementLevel: "cultivar_candidate",
    reviewStatus: "candidate_review",
    legalStatus: "grin_public_domain_ove87_use",
    projectionStatus: "quarantined",
    curatorDecision: "promote_to_canonical_seed",
    sourceRowReference:
      "Curated OVE-88 GRIN/NPGS proof row: candidate Bulgarian Carrot; species Capsicum annuum L.; crop Pepper.",
    aliases: [
      { displayName: "Bulgarian Carrot", locale: "en", isPrimary: true },
      {
        displayName: "Bulgarian Carrot pepper",
        locale: "en",
        isPrimary: false,
      },
      {
        displayName: "Capsicum annuum Bulgarian Carrot",
        locale: "la",
        isPrimary: false,
      },
    ],
  },
  {
    id: "GRIN:NPGS:OVE88:ODESSA-MARKET-TOMATO",
    candidateKind: "accession",
    displayName: "Odessa Market",
    canonicalName: "Odessa Market tomato",
    speciesName: "Solanum lycopersicum L.",
    cropName: "Tomato",
    accessionIdentifier: "GRIN curated proof row OVE88-002",
    accessionRecordUrl: GRIN_GENEBANK_SOURCE.url,
    improvementLevel: "cultivar_candidate",
    reviewStatus: "candidate_review",
    legalStatus: "grin_public_domain_ove87_use",
    projectionStatus: "quarantined",
    curatorDecision: "promote_to_canonical_seed",
    sourceRowReference:
      "Curated OVE-88 GRIN/NPGS proof row: candidate Odessa Market; species Solanum lycopersicum L.; crop Tomato.",
    aliases: [
      { displayName: "Odessa Market", locale: "en", isPrimary: true },
      { displayName: "Odessa Market tomato", locale: "en", isPrimary: false },
      {
        displayName: "Solanum lycopersicum Odessa Market",
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
  {
    id: "GRIN:NPGS:OVE88:BALKAN-DRY-BEAN-HOLD",
    candidateKind: "landrace",
    displayName: "Balkan dry bean proof row",
    canonicalName: "Balkan dry bean proof row",
    speciesName: "Phaseolus vulgaris L.",
    cropName: "Common bean",
    accessionIdentifier: "GRIN curated proof row OVE88-HOLD-001",
    accessionRecordUrl: GRIN_GENEBANK_SOURCE.url,
    improvementLevel: "landrace",
    reviewStatus: "candidate_review",
    legalStatus: "grin_public_domain_ove87_use",
    projectionStatus: "quarantined",
    curatorDecision: "hold_for_review",
    sourceRowReference:
      "Held OVE-88 GRIN/NPGS proof row; candidate identity is not curator-promoted.",
    aliases: [
      {
        displayName: "Balkan dry bean proof row",
        locale: "en",
        isPrimary: true,
      },
    ],
  },
  {
    id: "GRIN:NPGS:OVE88:KYIV-LONG-CUCUMBER-REVIEW",
    candidateKind: "accession",
    displayName: "Kyiv Long cucumber proof row",
    canonicalName: "Kyiv Long cucumber proof row",
    speciesName: "Cucumis sativus L.",
    cropName: "Cucumber",
    accessionIdentifier: "GRIN curated proof row OVE88-REVIEW-001",
    accessionRecordUrl: GRIN_GENEBANK_SOURCE.url,
    improvementLevel: "cultivar_candidate",
    reviewStatus: "review_needed",
    legalStatus: "grin_public_domain_ove87_use",
    projectionStatus: "quarantined",
    curatorDecision: "needs_taxonomy_review",
    sourceRowReference:
      "Review-needed OVE-88 GRIN/NPGS proof row; candidate remains source-only until curator review.",
    aliases: [
      {
        displayName: "Kyiv Long cucumber proof row",
        locale: "en",
        isPrimary: true,
      },
    ],
  },
  {
    id: "GRIN:NPGS:OVE88:CHERNOZEM-MELON-REVIEW",
    candidateKind: "accession",
    displayName: "Chernozem melon proof row",
    canonicalName: "Chernozem melon proof row",
    speciesName: "Cucumis melo L.",
    cropName: "Melon",
    accessionIdentifier: "GRIN curated proof row OVE88-REVIEW-002",
    accessionRecordUrl: GRIN_GENEBANK_SOURCE.url,
    improvementLevel: "cultivar_candidate",
    reviewStatus: "review_needed",
    legalStatus: "grin_public_domain_ove87_use",
    projectionStatus: "quarantined",
    curatorDecision: "needs_taxonomy_review",
    sourceRowReference:
      "Review-needed OVE-88 GRIN/NPGS proof row; candidate remains source-only until curator review.",
    aliases: [
      {
        displayName: "Chernozem melon proof row",
        locale: "en",
        isPrimary: true,
      },
    ],
  },
  {
    id: "GRIN:NPGS:OVE88:DUPLICATE-RED-CHERRY",
    candidateKind: "accession",
    displayName: "Red Cherry duplicate proof row",
    canonicalName: "Red Cherry duplicate proof row",
    speciesName: "Solanum lycopersicum L.",
    cropName: "Tomato",
    accessionIdentifier: "GRIN curated proof row OVE88-REJECT-001",
    accessionRecordUrl: GRIN_GENEBANK_SOURCE.url,
    improvementLevel: "cultivar_candidate",
    reviewStatus: "candidate_review",
    legalStatus: "grin_public_domain_ove87_use",
    projectionStatus: "rejected",
    curatorDecision: "reject_duplicate",
    sourceRowReference:
      "Rejected OVE-88 GRIN/NPGS proof row; duplicate candidate remains source-only.",
    aliases: [
      {
        displayName: "Red Cherry duplicate proof row",
        locale: "en",
        isPrimary: true,
      },
    ],
  },
  {
    id: "GRIN:NPGS:OVE88:AMBIGUOUS-CAPSICUM",
    candidateKind: "accession",
    displayName: "Ambiguous Capsicum proof row",
    canonicalName: "Ambiguous Capsicum proof row",
    speciesName: "Capsicum sp.",
    cropName: "Pepper",
    accessionIdentifier: "GRIN curated proof row OVE88-REJECT-002",
    accessionRecordUrl: GRIN_GENEBANK_SOURCE.url,
    improvementLevel: "unknown",
    reviewStatus: "candidate_review",
    legalStatus: "grin_public_domain_ove87_use",
    projectionStatus: "rejected",
    curatorDecision: "reject_ambiguous_identity",
    sourceRowReference:
      "Rejected OVE-88 GRIN/NPGS proof row; ambiguous identity remains source-only.",
    aliases: [
      {
        displayName: "Ambiguous Capsicum proof row",
        locale: "en",
        isPrimary: true,
      },
    ],
  },
  {
    id: "GRIN:NPGS:OVE88:RESTRICTED-FIELD-BLOCK",
    candidateKind: "accession",
    displayName: "Restricted-field proof row",
    canonicalName: "Restricted-field proof row",
    speciesName: "Triticum aestivum L.",
    cropName: "Wheat",
    accessionIdentifier: "GRIN curated proof row OVE88-BLOCK-001",
    accessionRecordUrl: GRIN_GENEBANK_SOURCE.url,
    improvementLevel: "source_only",
    reviewStatus: "blocked",
    legalStatus: "grin_public_domain_ove87_use",
    projectionStatus: "quarantined",
    curatorDecision: "blocked_source_only",
    sourceRowReference:
      "Blocked OVE-88 GRIN/NPGS proof row; not eligible for product projection.",
    aliases: [
      {
        displayName: "Restricted-field proof row",
        locale: "en",
        isPrimary: true,
      },
    ],
  },
  {
    id: "GRIN:NPGS:OVE88:DISTRIBUTION-CAVEAT-BLOCK",
    candidateKind: "accession",
    displayName: "Policy-caveat proof row",
    canonicalName: "Policy-caveat proof row",
    speciesName: "Lactuca sativa L.",
    cropName: "Lettuce",
    accessionIdentifier: "GRIN curated proof row OVE88-BLOCK-002",
    accessionRecordUrl: GRIN_GENEBANK_SOURCE.url,
    improvementLevel: "source_only",
    reviewStatus: "blocked",
    legalStatus: "grin_public_domain_ove87_use",
    projectionStatus: "quarantined",
    curatorDecision: "blocked_source_only",
    sourceRowReference:
      "Blocked OVE-88 GRIN/NPGS proof row; not eligible for product projection.",
    aliases: [
      {
        displayName: "Policy-caveat proof row",
        locale: "en",
        isPrimary: true,
      },
    ],
  },
  {
    id: "GRIN:NPGS:OVE88:EXTERNAL-TERMS-BLOCK",
    candidateKind: "accession",
    displayName: "External-terms proof row",
    canonicalName: "External-terms proof row",
    speciesName: "Brassica oleracea L.",
    cropName: "Cabbage",
    accessionIdentifier: "GRIN curated proof row OVE88-BLOCK-003",
    accessionRecordUrl: GRIN_GENEBANK_SOURCE.url,
    improvementLevel: "source_only",
    reviewStatus: "blocked",
    legalStatus: "grin_public_domain_ove87_use",
    projectionStatus: "quarantined",
    curatorDecision: "blocked_source_only",
    sourceRowReference:
      "Blocked OVE-88 GRIN/NPGS proof row; not eligible for product projection.",
    aliases: [
      {
        displayName: "External-terms proof row",
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
  };
}

export type GenebankLongTailSourceRow =
  (typeof GENEBANK_LONG_TAIL_SOURCE_ROWS)[number];

export interface GenebankLongTailSourceRecordDefinition {
  id: string;
  rawPayload: JsonValue;
  sourceOnlyFields: JsonValue;
  allowedProjection: JsonValue;
  projectionStatus: "quarantined" | "rejected";
}

export interface GenebankLongTailImportDefinition {
  source: typeof GRIN_GENEBANK_SOURCE;
  fileProof: typeof GENEBANK_LONG_TAIL_SOURCE_PROOF;
  records: GenebankLongTailSourceRecordDefinition[];
  promotion: GenebankLongTailProjection;
  promotions: GenebankLongTailProjection[];
  promotableRecordKey: string;
  promotableRecordKeys: string[];
  heldRecordKey: string;
  heldRecordKeys: string[];
  reviewNeededRecordKeys: string[];
  rejectedRecordKeys: string[];
  blockedRecordKeys: string[];
}

export function genebankLongTailDefinition(): GenebankLongTailImportDefinition {
  const promotableRows = GENEBANK_LONG_TAIL_SOURCE_ROWS.filter(
    (row) => row.curatorDecision === "promote_to_canonical_seed",
  );
  const promotions = promotableRows.map(buildGenebankLongTailProjection);
  const promotionBySourceId = new Map(
    promotions.map((projection) => [projection.sourceId, projection]),
  );
  const promotion = promotions[0];
  const heldRows = GENEBANK_LONG_TAIL_SOURCE_ROWS.filter(
    (row) => row.curatorDecision === "hold_for_review",
  );

  if (!promotion) {
    throw new Error("Genebank long-tail definition needs a promotion row.");
  }

  return {
    source: GRIN_GENEBANK_SOURCE,
    fileProof: GENEBANK_LONG_TAIL_SOURCE_PROOF,
    records: GENEBANK_LONG_TAIL_SOURCE_ROWS.map((row) =>
      buildGenebankLongTailSourceRecord(row, promotionBySourceId.get(row.id)),
    ),
    promotion,
    promotions,
    promotableRecordKey: promotableRows[0]?.id ?? promotion.sourceId,
    promotableRecordKeys: promotableRows.map((row) => row.id),
    heldRecordKey: heldRows[0]?.id ?? "",
    heldRecordKeys: heldRows.map((row) => row.id),
    reviewNeededRecordKeys: GENEBANK_LONG_TAIL_SOURCE_ROWS.filter(
      (row) => row.reviewStatus === "review_needed",
    ).map((row) => row.id),
    rejectedRecordKeys: GENEBANK_LONG_TAIL_SOURCE_ROWS.filter(
      (row) => row.projectionStatus === "rejected",
    ).map((row) => row.id),
    blockedRecordKeys: GENEBANK_LONG_TAIL_SOURCE_ROWS.filter(
      (row) => row.curatorDecision === "blocked_source_only",
    ).map((row) => row.id),
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

export function genebankLongTailPromotedProjections(
  definition = genebankLongTailDefinition(),
): GenebankLongTailProjection[] {
  return JSON.parse(
    stableJsonStringify(jsonValue(definition.promotions)),
  ) as GenebankLongTailProjection[];
}

export function genebankLongTailProjectionForRecord(
  sourceRecordKey: string,
  definition = genebankLongTailDefinition(),
): GenebankLongTailProjection {
  const projection = definition.promotions.find(
    (candidate) => candidate.sourceId === sourceRecordKey,
  );
  if (!projection) {
    throw new Error(
      `Genebank candidate ${sourceRecordKey} is not approved for promotion.`,
    );
  }
  return JSON.parse(
    stableJsonStringify(jsonValue(projection)),
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
    publicSlug: buildGenebankPublicSlug(row),
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
    },
  };
}

function buildGenebankLongTailSourceRecord(
  row: GenebankLongTailSourceRow,
  promotion: GenebankLongTailProjection | undefined,
): GenebankLongTailSourceRecordDefinition {
  const isPromotable =
    row.curatorDecision === "promote_to_canonical_seed" &&
    promotion !== undefined;

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
          promotion: promotion!,
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
    projectionStatus: row.projectionStatus,
  };
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildGenebankPublicSlug(row: GenebankLongTailSourceRow) {
  if (row.id === "GRIN:NPGS:OVE62:RED-CHERRY-TOMATO") {
    return "red-cherry-tomato-grin-genebank-candidate";
  }

  return `${row.canonicalName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-grin-genebank-candidate`;
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
