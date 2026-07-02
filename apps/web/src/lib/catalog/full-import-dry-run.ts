import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  CATALOG_SOURCE_SAMPLE,
  CATALOG_SOURCE_SAMPLE_PARSER_VERSION,
  catalogSourceSampleAllowedProjection,
} from "@/lib/catalog/source-sample";
import {
  UA_STATE_REGISTER_SOURCE,
  UA_STATE_REGISTER_VARIETY_PARSER_VERSION,
  UA_STATE_REGISTER_FULL_IMPORT_PROOF,
} from "@/lib/catalog/ua-state-register-variety";
import {
  SPECIES_BACKBONE_PARSER_VERSION,
  speciesBackboneConcepts,
  speciesBackboneSeedDefinition,
} from "@/lib/catalog/species-backbone-seed";
import {
  BREED_SEED_PARSER_VERSION,
  breedSeedConcepts,
  breedSeedDefinition,
} from "@/lib/catalog/breed-seed";
import {
  BG_OFFICIAL_VARIETY_PARSER_VERSION,
  bgOfficialVarietyDefinition,
} from "@/lib/catalog/bg-official-variety";
import {
  GENEBANK_LONG_TAIL_PARSER_VERSION,
  genebankLongTailDefinition,
} from "@/lib/catalog/genebank-long-tail";
import {
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
  EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE,
} from "@/lib/catalog/eu-official-journal-common-catalogue";
import {
  checkCatalogSourceProductProjection,
  type CatalogSourceSpecificProjectionGate,
} from "@/server/catalog-source/source-projection-guard";
import {
  EU_COMMON_CATALOGUE_CONFIDENCE_THRESHOLDS,
  EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
  extractFormexXmlFilesFromZip,
  parseEuCommonCatalogueFormex,
  type EuCommonCatalogueConfidenceBucket,
  type EuCommonCatalogueParsedRow,
  type EuCommonCatalogueParserResult,
  type EuCommonCatalogueSupplementType,
} from "./eu-common-catalogue-parser";

const MANIFEST_URL = new URL(
  "../../../../../docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json",
  import.meta.url,
);

const EU_OJ_COMMON_CATALOGUE_TARGET =
  "eu-official-journal-common-catalogue" as const;
const BG_OFFICIAL_VARIETIES_TARGET = "bg-official-varieties" as const;
const PGR_GENEBANK_BULK_GATE_TARGET = "pgr-genebank-bulk-gate" as const;
const EU_OJ_COMMON_CATALOGUE_SOURCE_SLUG =
  "eu-oj-eur-lex-common-catalogue" as const;
const EU_OJ_COMMON_CATALOGUE_INVENTORY_PARSER_VERSION =
  "ove101-eur-lex-oj-inventory-dry-run-v1";
const PGR_GENEBANK_BULK_GATE_VERSION = "ove87-pgr-genebank-bulk-gate.v1";
const DG_SANTE_COMMON_CATALOGUE_URL =
  "https://food.ec.europa.eu/plants/plant-reproductive-material/plant-variety-catalogues-databases-information-systems_en";

export const CATALOG_FULL_IMPORT_DRY_RUN_ENVIRONMENTS = [
  "local",
  "staging",
  "preview",
  "production",
] as const;

export const CATALOG_FULL_IMPORT_DRY_RUN_TARGETS = [
  "catalog-source-sample",
  "ua-register-variety",
  "species-backbone",
  "vernacular-alias-expansion",
  "breed-seed",
  "bg-official-variety",
  BG_OFFICIAL_VARIETIES_TARGET,
  "genebank-long-tail",
  PGR_GENEBANK_BULK_GATE_TARGET,
  EU_OJ_COMMON_CATALOGUE_TARGET,
] as const;

const CATALOG_FULL_IMPORT_DRY_RUN_DEFAULT_TARGETS = [
  "catalog-source-sample",
  "ua-register-variety",
  "species-backbone",
  "breed-seed",
  "bg-official-variety",
  "genebank-long-tail",
] as const satisfies readonly CatalogFullImportDryRunTarget[];

const FORBIDDEN_DRY_RUN_EVIDENCE_MARKERS = [
  "rawPayload",
  "raw_payload",
  "sourceOnlyFields",
  "source_only_fields",
  "sourceRecordId",
  "source_record_id",
  "sourceRecordKey",
  "source_record_key",
  "sourceSnapshotId",
  "source_snapshot_id",
  "allowedProjection",
  "allowed_projection",
  "decimalLatitude",
  "decimalLongitude",
  "occurrenceCoordinates",
  "poisonCoordinateSentinel",
  "nonProjectedDistributionText",
  "nationalId",
  "accessionIdentifier",
  "accessionRecordUrl",
  "genesysEuriscoBlocker",
  "dadIsEfabisInternalValidation",
  "latinNameDispute",
  "journalBody",
  "journalTitle",
  "ownerUserId",
  "owner_user_id",
  "quarantineKey",
  "derivativeKey",
  "email",
  "token",
  "secret",
  "user_agent",
  "referrer",
] as const;

export type CatalogFullImportDryRunEnvironment =
  (typeof CATALOG_FULL_IMPORT_DRY_RUN_ENVIRONMENTS)[number];

export type CatalogFullImportDryRunTarget =
  (typeof CATALOG_FULL_IMPORT_DRY_RUN_TARGETS)[number];

export type CatalogFullImportDryRunProjectionScope =
  | "full_import_wave"
  | "bounded_existing_proof"
  | "raw_quarantine_only";

export type CatalogFullImportDryRunTargetDefinition = Readonly<{
  key: string;
  packageScript: string;
  sourceSet: string;
  importerIssue: string;
  downstreamIssue: string;
  projectionScope: CatalogFullImportDryRunProjectionScope;
  sourceSlugs: readonly string[];
  readinessSourceSlugs: readonly string[];
  rowCounts: {
    sourceRowsWouldRead: number;
    rawRowsWouldCapture: number;
    productConceptsWouldProject: number;
    aliasesWouldProject: number;
    reviewNeededRows: number;
    rejectedRows: number;
    blockedRows: number;
    attributionRequiredSources: number;
  };
  parserVersions: readonly string[];
  projectionRequests: readonly CatalogFullImportDryRunProjectionRequest[];
  duplicateSignals: readonly CatalogFullImportDryRunDuplicateSignal[];
}>;

export interface CatalogFullImportDryRunProjectionRequest {
  sourceSlug: string;
  productSurface: "catalog_items" | "catalog_item_names";
  sourceVersion?: string;
  sourceRecordKey?: string;
  sourceUrl?: string;
  productSource?: string;
  productSourceId?: string;
  explicitGate?: CatalogSourceSpecificProjectionGate;
}

export interface CatalogFullImportDryRunDuplicateSignal {
  signal: string;
  conceptRole: string;
}

export interface CatalogFullImportDryRunOptions {
  environment: CatalogFullImportDryRunEnvironment;
  confirmEnvironment: CatalogFullImportDryRunEnvironment;
  preflightOnly: boolean;
  targets: CatalogFullImportDryRunTarget[];
}

export interface CatalogFullImportDryRunManifest {
  fullImportReadiness: {
    issue: string;
    verificationDate: string;
    sourceVerdicts: CatalogFullImportSourceVerdict[];
  };
}

export interface CatalogFullImportSourceVerdict {
  slug: string;
  rawQuarantineAllowed: boolean;
  productProjectionAllowed: boolean;
  productProjectionMode: string;
  importWaves: string[];
  nextIssueDependency: string;
}

export interface CatalogFullImportDryRunTargetReport {
  key: string;
  packageScript: string;
  sourceSet: string;
  importerIssue: string;
  downstreamIssue: string;
  projectionScope: CatalogFullImportDryRunProjectionScope;
  sources: string[];
  readinessVerdicts: Array<{
    slug: string;
    rawQuarantineAllowed: boolean;
    productProjectionAllowed: boolean;
    productProjectionMode: string;
    importWaves: string[];
    nextIssueDependency: string;
  }>;
  counts: CatalogFullImportDryRunTargetDefinition["rowCounts"];
  parserVersions: string[];
  projectionGuard: {
    status: "passed";
    checkedProjectionRequests: number;
  };
  leakCheck: {
    status: "passed";
    forbiddenMarkerCount: number;
  };
  sourceInventory?: CatalogFullImportDryRunSourceInventory;
}

export interface CatalogFullImportDryRunReport {
  schemaVersion: "ove80.catalogFullImportDryRun.v1";
  issue: "OVE-80";
  generatedAt: string;
  environment: {
    name: CatalogFullImportDryRunEnvironment;
    preflightOnly: true;
    mutation: "blocked_by_design";
    evidenceSafety: "linear_safe_redacted";
  };
  readinessGate: {
    issue: string;
    verificationDate: string;
    manifestPath: "docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json";
  };
  targets: CatalogFullImportDryRunTargetReport[];
  totals: CatalogFullImportDryRunTargetDefinition["rowCounts"] & {
    targets: number;
    readinessSources: number;
  };
  duplicateRisk: {
    clusters: Array<{
      signal: string;
      riskLevel: "review_needed";
      reason: string;
      members: Array<{
        target: string;
        conceptRole: string;
      }>;
      requiredGate: "OVE-89";
    }>;
  };
  downstreamUsage: {
    requiredBeforeIssues: string[];
    rule: string;
  };
  leakCheck: "passed";
}

export interface CatalogFullImportDryRunSourceInventory {
  issue: "OVE-102";
  status: "passed" | "review_needed";
  discoverySource: {
    url: string;
    fetched: boolean;
    httpStatus: number | null;
    contentType: string | null;
    byteLength: number;
    checksumSha256: string | null;
    candidateLinksFound: number;
  };
  fetchStrategy: {
    preferredArtifactOrder: string[];
    notes: string[];
  };
  candidates: CatalogFullImportDryRunSourceInventoryCandidate[];
  parserQa?: CatalogFullImportDryRunSourceParserQa;
  reviewNeeded: string[];
}

export interface CatalogFullImportDryRunSourceInventoryCandidate {
  sourceFamily: "eu-official-journal-common-catalogue";
  supplementType: EuCommonCatalogueSupplementType;
  label: string;
  title: string | null;
  publicationDate: string | null;
  language: "EN";
  eurLexUrl: string;
  ojUrl: string;
  ojCitation: string | null;
  eliUrl: string | null;
  celexId: string | null;
  celexUrl: string | null;
  cellarId: string | null;
  artifacts: CatalogFullImportDryRunSourceInventoryArtifact[];
  fetchStatus: "fetched" | "review_needed";
  parseStatus: "formex_parser_qa_reported" | "parser_qa_review_needed";
  reviewStatus: "parser_qa_reported" | "review_needed";
  parserQa?: CatalogFullImportDryRunCandidateParserQa;
}

export interface CatalogFullImportDryRunSourceInventoryArtifact {
  format: "xml_notice" | "formex_zip" | "celex_rdf" | "html" | "pdf";
  role:
    | "preferred_machine_readable"
    | "metadata_fallback"
    | "source_page"
    | "authentic_oj_fallback";
  url: string | null;
  fetchStatus: "fetched" | "available_not_fetched" | "review_needed";
  parseStatus:
    | "metadata_parsed"
    | "parser_qa_parsed"
    | "not_parsed_dry_run_only"
    | "not_machine_preferred"
    | "fallback_review_needed";
  httpStatus: number | null;
  contentType: string | null;
  byteLength: number | null;
  checksumSha256: string | null;
}

export interface CatalogFullImportDryRunSourceParserQa {
  issue: "OVE-102";
  status: "passed" | "review_needed";
  parserVersion: string;
  thresholds: typeof EU_COMMON_CATALOGUE_CONFIDENCE_THRESHOLDS;
  totals: EuCommonCatalogueParserResult["totals"];
  bySupplement: EuCommonCatalogueParserResult["bySupplement"];
  bySpeciesOrCrop: EuCommonCatalogueParserResult["bySpeciesOrCrop"];
  byCountry: EuCommonCatalogueParserResult["byCountry"];
  byNotifier: EuCommonCatalogueParserResult["byNotifier"];
  byConfidenceBucket: EuCommonCatalogueParserResult["byConfidenceBucket"];
  sampleRows: CatalogFullImportDryRunParserQaSampleRow[];
  reviewNeeded: string[];
  rejected: string[];
}

export interface CatalogFullImportDryRunCandidateParserQa {
  parserVersion: string;
  thresholds: typeof EU_COMMON_CATALOGUE_CONFIDENCE_THRESHOLDS;
  totals: EuCommonCatalogueParserResult["totals"];
  bySpeciesOrCrop: EuCommonCatalogueParserResult["bySpeciesOrCrop"];
  byCountry: EuCommonCatalogueParserResult["byCountry"];
  byNotifier: EuCommonCatalogueParserResult["byNotifier"];
  byConfidenceBucket: EuCommonCatalogueParserResult["byConfidenceBucket"];
  sampleRows: CatalogFullImportDryRunParserQaSampleRow[];
}

export interface CatalogFullImportDryRunParserQaSampleRow {
  supplementType: EuCommonCatalogueSupplementType;
  supplementLabel: string;
  varietyDenomination: string | null;
  speciesOrCrop: string | null;
  countryCode: string | null;
  notifierCode: string | null;
  admissionAction: "add" | "delete" | "modify" | null;
  marketExtensionDate: string | null;
  registerType: "agricultural_common_catalogue" | "vegetable_common_catalogue";
  ojCitation: string | null;
  sourceUrl: string;
  publicationDate: string | null;
  artifactChecksumSha256: string;
  parserVersion: string;
  extractionConfidence: number;
  confidenceBucket: EuCommonCatalogueConfidenceBucket;
  statusReasons: string[];
}

export type CatalogFullImportDryRunFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export function parseCatalogFullImportDryRunArgs(
  argv: string[],
): Partial<CatalogFullImportDryRunOptions> {
  const options: Partial<CatalogFullImportDryRunOptions> = {
    preflightOnly: false,
    targets: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;

    switch (arg) {
      case "--environment":
        options.environment = parseEnvironment(argv[index + 1], arg);
        index += 1;
        break;
      case "--confirm-environment":
        options.confirmEnvironment = parseEnvironment(argv[index + 1], arg);
        index += 1;
        break;
      case "--preflight-only":
        options.preflightOnly = true;
        break;
      case "--target":
        options.targets = [
          ...(options.targets ?? []),
          parseTarget(argv[index + 1], arg),
        ];
        index += 1;
        break;
      default:
        throw new Error(`Unsupported option: ${arg}`);
    }
  }

  return options;
}

export function validateCatalogFullImportDryRunOptions(
  options: Partial<CatalogFullImportDryRunOptions>,
): CatalogFullImportDryRunOptions {
  if (!options.environment) {
    throw new Error("Missing --environment.");
  }
  if (!options.confirmEnvironment) {
    throw new Error("Missing --confirm-environment.");
  }
  if (options.environment !== options.confirmEnvironment) {
    throw new Error("--confirm-environment must exactly match --environment.");
  }
  if (options.environment !== "local" && !options.preflightOnly) {
    throw new Error(
      "Non-local dry-run requires --preflight-only; this command never mutates staging, preview, or production.",
    );
  }

  return {
    environment: options.environment,
    confirmEnvironment: options.confirmEnvironment,
    preflightOnly: true,
    targets:
      options.targets && options.targets.length > 0
        ? dedupeTargets(options.targets)
        : [...CATALOG_FULL_IMPORT_DRY_RUN_DEFAULT_TARGETS],
  };
}

export function buildCatalogFullImportDryRunReport(input: {
  options: CatalogFullImportDryRunOptions;
  generatedAt: string;
  manifest?: CatalogFullImportDryRunManifest;
  targetDefinitions?: readonly CatalogFullImportDryRunTargetDefinition[];
}): CatalogFullImportDryRunReport {
  const manifest = input.manifest ?? readCatalogFullImportDryRunManifest();
  assertReadinessGate(manifest);

  const definitions = input.targetDefinitions ?? buildDryRunTargetDefinitions();
  const selectedDefinitions = input.options.targets.map((target) => {
    const definition = definitions.find((item) => item.key === target);
    if (!definition) {
      throw new Error(`Unknown dry-run target: ${target}.`);
    }
    return definition;
  });

  const targets = selectedDefinitions.map((definition) =>
    buildTargetReport(definition, manifest),
  );

  const report: CatalogFullImportDryRunReport = {
    schemaVersion: "ove80.catalogFullImportDryRun.v1",
    issue: "OVE-80",
    generatedAt: input.generatedAt,
    environment: {
      name: input.options.environment,
      preflightOnly: true,
      mutation: "blocked_by_design",
      evidenceSafety: "linear_safe_redacted",
    },
    readinessGate: {
      issue: manifest.fullImportReadiness.issue,
      verificationDate: manifest.fullImportReadiness.verificationDate,
      manifestPath:
        "docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json",
    },
    targets,
    totals: buildTotals(targets),
    duplicateRisk: {
      clusters: buildDuplicateRiskClusters(selectedDefinitions),
    },
    downstreamUsage: {
      requiredBeforeIssues: [
        "OVE-81",
        "OVE-82",
        "OVE-83",
        "OVE-85",
        "OVE-103",
        "OVE-86",
        "OVE-87",
        "OVE-88",
        "OVE-89",
        "OVE-90",
      ],
      rule: "Later bulk import issues must attach this redacted report or a target-specific successor report before any source-family mutation or product projection.",
    },
    leakCheck: "passed",
  };

  assertNoForbiddenCatalogFullImportDryRunEvidence(report);
  return report;
}

export async function buildCatalogFullImportDryRunReportWithLiveInventory(input: {
  options: CatalogFullImportDryRunOptions;
  generatedAt: string;
  manifest?: CatalogFullImportDryRunManifest;
  targetDefinitions?: readonly CatalogFullImportDryRunTargetDefinition[];
  fetchImpl?: CatalogFullImportDryRunFetch;
}): Promise<CatalogFullImportDryRunReport> {
  const report = buildCatalogFullImportDryRunReport(input);
  if (
    !report.targets.some(
      (target) =>
        target.key === EU_OJ_COMMON_CATALOGUE_TARGET ||
        target.key === BG_OFFICIAL_VARIETIES_TARGET,
    )
  ) {
    return report;
  }

  const sourceInventory = await buildEuOfficialJournalCommonCatalogueInventory(
    input.fetchImpl ?? fetch,
  );
  const targets = report.targets.map((target) =>
    target.key === BG_OFFICIAL_VARIETIES_TARGET
      ? applyBgOfficialVarietiesParserQaToTarget(target, sourceInventory)
      : target.key === EU_OJ_COMMON_CATALOGUE_TARGET
        ? applyEuOfficialJournalParserQaToTarget(target, sourceInventory)
        : target,
  );
  const updatedReport = {
    ...report,
    targets,
    totals: buildTotals(targets),
  };

  assertNoForbiddenCatalogFullImportDryRunEvidence(updatedReport);
  return updatedReport;
}

export function readCatalogFullImportDryRunManifest(): CatalogFullImportDryRunManifest {
  return JSON.parse(
    readFileSync(MANIFEST_URL, "utf8"),
  ) as CatalogFullImportDryRunManifest;
}

export function buildDryRunTargetDefinitions(): CatalogFullImportDryRunTargetDefinition[] {
  const sampleProjection = catalogSourceSampleAllowedProjection();
  const speciesDefinition = speciesBackboneSeedDefinition();
  const speciesConcepts = speciesBackboneConcepts(speciesDefinition);
  const speciesSourceRecords = speciesConcepts.flatMap(
    (concept) => concept.sourceRecords,
  );
  const speciesAliasCandidates = speciesConcepts.flatMap(
    (concept) => concept.aliasCandidates,
  );
  const speciesSourceSlugs = dedupeStrings(
    speciesSourceRecords.map((record) => record.source.slug),
  );
  const speciesAliasExpansionCandidates = speciesAliasCandidates.filter(
    (alias) =>
      alias.aliasKind === "vernacular_alias" ||
      alias.aliasKind === "generated_variant",
  );
  const speciesAliasExpansionSourceSlugs = dedupeStrings(
    speciesAliasExpansionCandidates.map((alias) => alias.sourceSlug),
  );
  const speciesAliasExpansionReadinessSourceSlugs = speciesSourceSlugs.filter(
    (sourceSlug) => speciesAliasExpansionSourceSlugs.includes(sourceSlug),
  );
  const speciesAliasExpansionSourceRecords = speciesSourceRecords.filter(
    (record) =>
      speciesAliasExpansionReadinessSourceSlugs.includes(record.source.slug),
  );
  const breedDefinition = breedSeedDefinition();
  const breedConcepts = breedSeedConcepts(breedDefinition);
  const breedAliasCandidates = breedConcepts.flatMap(
    (concept) => concept.aliasCandidates,
  );
  const breedSourceSlugs = dedupeStrings(
    breedConcepts.map((concept) => concept.source.slug),
  );
  const breedReadinessSourceSlugs = breedSourceSlugs.filter(
    (sourceSlug) => sourceSlug === "vertebrate-breed-ontology",
  );
  const bgDefinition = bgOfficialVarietyDefinition();
  const genebankDefinition = genebankLongTailDefinition();

  return [
    {
      key: "catalog-source-sample",
      packageScript: "catalog:sources:import-sample",
      sourceSet: "OVE-56 source snapshot quarantine proof",
      importerIssue: "OVE-56",
      downstreamIssue: "OVE-80",
      projectionScope: "bounded_existing_proof",
      sourceSlugs: [CATALOG_SOURCE_SAMPLE.source.slug],
      readinessSourceSlugs: [CATALOG_SOURCE_SAMPLE.source.slug],
      rowCounts: {
        sourceRowsWouldRead: 1,
        rawRowsWouldCapture: 1,
        productConceptsWouldProject: 1,
        aliasesWouldProject: sampleProjection.aliases.length,
        reviewNeededRows: 0,
        rejectedRows: 0,
        blockedRows: 0,
        attributionRequiredSources: CATALOG_SOURCE_SAMPLE.source
          .attributionRequired
          ? 1
          : 0,
      },
      parserVersions: [CATALOG_SOURCE_SAMPLE_PARSER_VERSION],
      projectionRequests: [
        {
          sourceSlug: CATALOG_SOURCE_SAMPLE.source.slug,
          productSurface: "catalog_items",
        },
        {
          sourceSlug: CATALOG_SOURCE_SAMPLE.source.slug,
          productSurface: "catalog_item_names",
        },
      ],
      duplicateSignals: [
        {
          signal: "prunus-armeniaca-variety-boundary",
          conceptRole: "apricot proof variety",
        },
      ],
    },
    {
      key: "ua-register-variety",
      packageScript: "catalog:sources:import-ua-register-variety",
      sourceSet: "OVE-81 UA State Register official variety wave",
      importerIssue: "OVE-81",
      downstreamIssue: "OVE-89",
      projectionScope: "full_import_wave",
      sourceSlugs: [UA_STATE_REGISTER_SOURCE.slug],
      readinessSourceSlugs: [UA_STATE_REGISTER_SOURCE.slug],
      rowCounts: {
        sourceRowsWouldRead: UA_STATE_REGISTER_FULL_IMPORT_PROOF.sourceRowsRead,
        rawRowsWouldCapture:
          UA_STATE_REGISTER_FULL_IMPORT_PROOF.rawRowsCaptured,
        productConceptsWouldProject:
          UA_STATE_REGISTER_FULL_IMPORT_PROOF.productConceptsProjected,
        aliasesWouldProject:
          UA_STATE_REGISTER_FULL_IMPORT_PROOF.aliasesProjected,
        reviewNeededRows: UA_STATE_REGISTER_FULL_IMPORT_PROOF.reviewNeededRows,
        rejectedRows: UA_STATE_REGISTER_FULL_IMPORT_PROOF.rejectedRows,
        blockedRows: 0,
        attributionRequiredSources: UA_STATE_REGISTER_SOURCE.attributionRequired
          ? 1
          : 0,
      },
      parserVersions: [UA_STATE_REGISTER_VARIETY_PARSER_VERSION],
      projectionRequests: [
        {
          sourceSlug: UA_STATE_REGISTER_SOURCE.slug,
          productSurface: "catalog_items",
        },
        {
          sourceSlug: UA_STATE_REGISTER_SOURCE.slug,
          productSurface: "catalog_item_names",
        },
      ],
      duplicateSignals: [
        {
          signal: "ua-register-duplicate-denominations",
          conceptRole: `${UA_STATE_REGISTER_FULL_IMPORT_PROOF.duplicateCanonicalNameClusters} repeated official variety denomination clusters for OVE-89 review`,
        },
      ],
    },
    {
      key: "species-backbone",
      packageScript: "catalog:sources:import-species-backbone",
      sourceSet: "OVE-82 planned species backbone wave",
      importerIssue: "OVE-82",
      downstreamIssue: "OVE-82",
      projectionScope: "full_import_wave",
      sourceSlugs: speciesSourceSlugs,
      readinessSourceSlugs: speciesSourceSlugs,
      rowCounts: {
        sourceRowsWouldRead: speciesSourceRecords.length,
        rawRowsWouldCapture: speciesSourceRecords.length,
        productConceptsWouldProject: speciesConcepts.length,
        aliasesWouldProject: speciesConcepts.reduce(
          (total, concept) => total + concept.projection.aliases.length,
          0,
        ),
        reviewNeededRows: speciesAliasCandidates.filter(
          (alias) => alias.status === "review_needed",
        ).length,
        rejectedRows: speciesAliasCandidates.filter(
          (alias) => alias.status === "rejected",
        ).length,
        blockedRows: speciesAliasCandidates.filter(
          (alias) =>
            alias.status === "review_needed" ||
            alias.status === "rejected" ||
            alias.status === "generated",
        ).length,
        attributionRequiredSources: speciesSourceRecords.filter(
          (record) => record.source.attributionRequired,
        ).length,
      },
      parserVersions: [SPECIES_BACKBONE_PARSER_VERSION],
      projectionRequests: speciesSourceSlugs.flatMap((sourceSlug) => [
        {
          sourceSlug,
          productSurface: "catalog_items" as const,
        },
        {
          sourceSlug,
          productSurface: "catalog_item_names" as const,
        },
      ]),
      duplicateSignals: [
        {
          signal: "solanum-lycopersicum-boundary",
          conceptRole: "species backbone",
        },
      ],
    },
    {
      key: "vernacular-alias-expansion",
      packageScript: "catalog:sources:import-species-backbone",
      sourceSet: "OVE-83 reviewed vernacular alias expansion",
      importerIssue: "OVE-83",
      downstreamIssue: "OVE-89",
      projectionScope: "full_import_wave",
      sourceSlugs: speciesAliasExpansionSourceSlugs,
      readinessSourceSlugs: speciesAliasExpansionReadinessSourceSlugs,
      rowCounts: {
        sourceRowsWouldRead: speciesAliasExpansionCandidates.length,
        rawRowsWouldCapture: 0,
        productConceptsWouldProject: 0,
        aliasesWouldProject: speciesAliasExpansionCandidates.filter(
          (alias) => alias.status === "accepted",
        ).length,
        reviewNeededRows: speciesAliasExpansionCandidates.filter(
          (alias) => alias.status === "review_needed",
        ).length,
        rejectedRows: speciesAliasExpansionCandidates.filter(
          (alias) => alias.status === "rejected",
        ).length,
        blockedRows: speciesAliasExpansionCandidates.filter(
          (alias) => alias.status !== "accepted",
        ).length,
        attributionRequiredSources: speciesAliasExpansionSourceRecords.filter(
          (record) => record.source.attributionRequired,
        ).length,
      },
      parserVersions: [SPECIES_BACKBONE_PARSER_VERSION],
      projectionRequests: speciesAliasExpansionReadinessSourceSlugs.map(
        (sourceSlug) => ({
          sourceSlug,
          productSurface: "catalog_item_names" as const,
        }),
      ),
      duplicateSignals: [
        {
          signal: "reviewed-vernacular-alias-collisions",
          conceptRole:
            "local Ukrainian, Bulgarian, English, and scientific-name lookup aliases",
        },
      ],
    },
    {
      key: "breed-seed",
      packageScript: "catalog:sources:import-breed-seed",
      sourceSet: "OVE-86 approved bee and VBO breed expansion",
      importerIssue: "OVE-86",
      downstreamIssue: "OVE-86",
      projectionScope: "full_import_wave",
      sourceSlugs: breedSourceSlugs,
      readinessSourceSlugs: breedReadinessSourceSlugs,
      rowCounts: {
        sourceRowsWouldRead: breedConcepts.length,
        rawRowsWouldCapture: breedConcepts.length,
        productConceptsWouldProject: breedConcepts.length,
        aliasesWouldProject: breedAliasCandidates.filter(
          (alias) => alias.status === "accepted",
        ).length,
        reviewNeededRows: breedAliasCandidates.filter(
          (alias) => alias.status === "review_needed",
        ).length,
        rejectedRows: breedAliasCandidates.filter(
          (alias) => alias.status === "rejected",
        ).length,
        blockedRows: breedAliasCandidates.filter(
          (alias) => alias.status !== "accepted",
        ).length,
        attributionRequiredSources: breedSourceSlugs.length,
      },
      parserVersions: [BREED_SEED_PARSER_VERSION],
      projectionRequests: [
        ...breedConcepts.flatMap((concept) =>
          (["catalog_items", "catalog_item_names"] as const).map(
            (productSurface) => ({
              sourceSlug: concept.source.slug,
              sourceVersion: concept.source.version,
              sourceRecordKey: concept.record.id,
              productSurface,
              productSource: concept.projection.source,
              productSourceId: concept.projection.sourceId,
              explicitGate:
                concept.source.slug === "ua-official-bee-breeds"
                  ? {
                      issueKey:
                        concept.record.id ===
                        "ua-law-1492-iii:bee-breed:carpathian"
                          ? "OVE-60"
                          : "OVE-86",
                      gateId:
                        concept.record.id ===
                        "ua-law-1492-iii:bee-breed:carpathian"
                          ? "ove-60-ua-official-bee-breed-manual-seed"
                          : "ove-86-ua-official-bee-breed-expanded-manual-seed",
                      scope: "manual_seed" as const,
                    }
                  : undefined,
            }),
          ),
        ),
      ],
      duplicateSignals: [
        {
          signal: "approved-breed-kind-mapping",
          conceptRole:
            "bee manual seed and VBO animal breed labels share catalogKind=breed with different object-kind outcomes",
        },
      ],
    },
    {
      key: "bg-official-variety",
      packageScript: "catalog:sources:import-bg-official-variety",
      sourceSet: "OVE-61 BG official variety proof subset",
      importerIssue: "OVE-61",
      downstreamIssue: "OVE-85",
      projectionScope: "bounded_existing_proof",
      sourceSlugs: [bgDefinition.source.slug],
      readinessSourceSlugs: [bgDefinition.source.slug],
      rowCounts: {
        sourceRowsWouldRead: bgDefinition.records.length,
        rawRowsWouldCapture: bgDefinition.records.length,
        productConceptsWouldProject: 1,
        aliasesWouldProject: bgDefinition.projection.aliases.length,
        reviewNeededRows: bgDefinition.records.filter(
          (record) => record.projectionStatus !== "projected",
        ).length,
        rejectedRows: 0,
        blockedRows: bgDefinition.records.filter(
          (record) => record.projectionStatus !== "projected",
        ).length,
        attributionRequiredSources: bgDefinition.source.attributionRequired
          ? 1
          : 0,
      },
      parserVersions: [BG_OFFICIAL_VARIETY_PARSER_VERSION],
      projectionRequests: [
        {
          sourceSlug: bgDefinition.source.slug,
          sourceVersion: bgDefinition.source.version,
          sourceRecordKey: bgDefinition.projection.sourceId,
          productSurface: "catalog_items",
          productSource: bgDefinition.projection.source,
          productSourceId: bgDefinition.projection.sourceId,
          explicitGate: {
            issueKey: "OVE-61",
            gateId: "ove-61-bg-official-variety-reviewed-subset",
            scope: "reviewed_subset",
          },
        },
        {
          sourceSlug: bgDefinition.source.slug,
          sourceVersion: bgDefinition.source.version,
          sourceRecordKey: bgDefinition.projection.sourceId,
          productSurface: "catalog_item_names",
          productSource: bgDefinition.projection.source,
          productSourceId: bgDefinition.projection.sourceId,
          explicitGate: {
            issueKey: "OVE-61",
            gateId: "ove-61-bg-official-variety-reviewed-subset",
            scope: "reviewed_subset",
          },
        },
      ],
      duplicateSignals: [],
    },
    {
      key: BG_OFFICIAL_VARIETIES_TARGET,
      packageScript: "catalog:sources:import-eu-oj-common-catalogue",
      sourceSet:
        "OVE-85 BG official varieties via EUR-Lex Official Journal rows",
      importerIssue: "OVE-85",
      downstreamIssue: "OVE-89",
      projectionScope: "full_import_wave",
      sourceSlugs: [EU_OJ_COMMON_CATALOGUE_SOURCE_SLUG],
      readinessSourceSlugs: [EU_OJ_COMMON_CATALOGUE_SOURCE_SLUG],
      rowCounts: {
        sourceRowsWouldRead: 0,
        rawRowsWouldCapture: 0,
        productConceptsWouldProject: 0,
        aliasesWouldProject: 0,
        reviewNeededRows: 0,
        rejectedRows: 0,
        blockedRows: 0,
        attributionRequiredSources: 1,
      },
      parserVersions: [
        EU_OJ_COMMON_CATALOGUE_INVENTORY_PARSER_VERSION,
        EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
      ],
      projectionRequests: [
        {
          sourceSlug: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
          sourceVersion: "C/2026/830:vegetable_supplement_h:2026-02-12",
          sourceRecordKey: "EUR-Lex:ELI:C/2026/830:row:bg-dry-run-policy-check",
          sourceUrl: "https://eur-lex.europa.eu/eli/C/2026/830/oj",
          productSurface: "catalog_items",
          productSource: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
          productSourceId: "EUR-Lex:ELI:C/2026/830:row:bg-dry-run-policy-check",
        },
        {
          sourceSlug: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
          sourceVersion: "C/2026/830:vegetable_supplement_h:2026-02-12",
          sourceRecordKey: "EUR-Lex:ELI:C/2026/830:row:bg-dry-run-policy-check",
          sourceUrl: "https://eur-lex.europa.eu/eli/C/2026/830/oj",
          productSurface: "catalog_item_names",
          productSource: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
          productSourceId: "EUR-Lex:ELI:C/2026/830:row:bg-dry-run-policy-check",
        },
      ],
      duplicateSignals: [
        {
          signal: "eu-oj-bg-official-variety-denominations",
          conceptRole:
            "Official Journal Bulgaria-notified variety denominations for OVE-89 entity-resolution review",
        },
      ],
    },
    {
      key: "genebank-long-tail",
      packageScript: "catalog:sources:import-genebank-long-tail",
      sourceSet: "OVE-88 GRIN/NPGS genebank bulk candidate quarantine",
      importerIssue: "OVE-88",
      downstreamIssue: "OVE-88",
      projectionScope: "full_import_wave",
      sourceSlugs: [genebankDefinition.source.slug],
      readinessSourceSlugs: [genebankDefinition.source.slug],
      rowCounts: {
        sourceRowsWouldRead: genebankDefinition.records.length,
        rawRowsWouldCapture: genebankDefinition.records.length,
        productConceptsWouldProject: genebankDefinition.promotions.length,
        aliasesWouldProject: genebankDefinition.promotions.reduce(
          (sum, projection) => sum + projection.aliases.length,
          0,
        ),
        reviewNeededRows: genebankDefinition.reviewNeededRecordKeys.length,
        rejectedRows: genebankDefinition.rejectedRecordKeys.length,
        blockedRows:
          genebankDefinition.blockedRecordKeys.length +
          genebankDefinition.heldRecordKeys.length,
        attributionRequiredSources: genebankDefinition.source
          .attributionRequired
          ? 1
          : 0,
      },
      parserVersions: [GENEBANK_LONG_TAIL_PARSER_VERSION],
      projectionRequests: genebankDefinition.promotions.flatMap(
        (projection) => [
          {
            sourceSlug: genebankDefinition.source.slug,
            sourceVersion: genebankDefinition.source.version,
            sourceRecordKey: projection.sourceId,
            sourceUrl: genebankDefinition.source.url,
            productSurface: "catalog_items",
            productSource: projection.source,
            productSourceId: projection.sourceId,
          },
          {
            sourceSlug: genebankDefinition.source.slug,
            sourceVersion: genebankDefinition.source.version,
            sourceRecordKey: projection.sourceId,
            sourceUrl: genebankDefinition.source.url,
            productSurface: "catalog_item_names",
            productSource: projection.source,
            productSourceId: projection.sourceId,
          },
        ],
      ),
      duplicateSignals: [
        {
          signal: "solanum-lycopersicum-boundary",
          conceptRole: "variety candidate under tomato species",
        },
      ],
    },
    {
      key: PGR_GENEBANK_BULK_GATE_TARGET,
      packageScript: "catalog:sources:verify",
      sourceSet: "OVE-87 PGR source-use gate",
      importerIssue: "OVE-87",
      downstreamIssue: "OVE-88",
      projectionScope: "raw_quarantine_only",
      sourceSlugs: ["grin-global", "genesys-pgr", "eurisco"],
      readinessSourceSlugs: ["grin-global", "genesys-pgr", "eurisco"],
      rowCounts: {
        sourceRowsWouldRead: 3,
        rawRowsWouldCapture: 0,
        productConceptsWouldProject: 0,
        aliasesWouldProject: 0,
        reviewNeededRows: 1,
        rejectedRows: 0,
        blockedRows: 2,
        attributionRequiredSources: 2,
      },
      parserVersions: [PGR_GENEBANK_BULK_GATE_VERSION],
      projectionRequests: [],
      duplicateSignals: [
        {
          signal: "pgr-source-use-boundary",
          conceptRole:
            "PGR legal/source gate before GRIN-only OVE-88 candidate import",
        },
      ],
    },
    {
      key: EU_OJ_COMMON_CATALOGUE_TARGET,
      packageScript: "catalog:sources:import-eu-oj-common-catalogue",
      sourceSet:
        "OVE-103 EUR-Lex Official Journal Common Catalogue product projection",
      importerIssue: "OVE-103",
      downstreamIssue: "OVE-89",
      projectionScope: "full_import_wave",
      sourceSlugs: [EU_OJ_COMMON_CATALOGUE_SOURCE_SLUG],
      readinessSourceSlugs: [EU_OJ_COMMON_CATALOGUE_SOURCE_SLUG],
      rowCounts: {
        sourceRowsWouldRead: 0,
        rawRowsWouldCapture: 0,
        productConceptsWouldProject: 0,
        aliasesWouldProject: 0,
        reviewNeededRows: 0,
        rejectedRows: 0,
        blockedRows: 0,
        attributionRequiredSources: 1,
      },
      parserVersions: [
        EU_OJ_COMMON_CATALOGUE_INVENTORY_PARSER_VERSION,
        EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
      ],
      projectionRequests: [
        {
          sourceSlug: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
          sourceVersion: "C/2026/830:vegetable_supplement_h:2026-02-12",
          sourceRecordKey: "EUR-Lex:ELI:C/2026/830:row:dry-run-policy-check",
          sourceUrl: "https://eur-lex.europa.eu/eli/C/2026/830/oj",
          productSurface: "catalog_items",
          productSource: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
          productSourceId: "EUR-Lex:ELI:C/2026/830:row:dry-run-policy-check",
        },
        {
          sourceSlug: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_SOURCE.slug,
          sourceVersion: "C/2026/830:vegetable_supplement_h:2026-02-12",
          sourceRecordKey: "EUR-Lex:ELI:C/2026/830:row:dry-run-policy-check",
          sourceUrl: "https://eur-lex.europa.eu/eli/C/2026/830/oj",
          productSurface: "catalog_item_names",
          productSource: EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE,
          productSourceId: "EUR-Lex:ELI:C/2026/830:row:dry-run-policy-check",
        },
      ],
      duplicateSignals: [
        {
          signal: "eu-oj-common-catalogue-variety-denominations",
          conceptRole:
            "Official Journal accepted variety denominations for OVE-89 entity-resolution review",
        },
      ],
    },
  ];
}

export function assertNoForbiddenCatalogFullImportDryRunEvidence(
  output: unknown,
) {
  const text = JSON.stringify(output).toLowerCase();
  for (const marker of FORBIDDEN_DRY_RUN_EVIDENCE_MARKERS) {
    if (text.includes(marker.toLowerCase())) {
      throw new Error(
        `Full import dry-run evidence contains forbidden marker: ${marker}.`,
      );
    }
  }
}

function buildTargetReport(
  definition: CatalogFullImportDryRunTargetDefinition,
  manifest: CatalogFullImportDryRunManifest,
): CatalogFullImportDryRunTargetReport {
  const readinessVerdicts = definition.readinessSourceSlugs.map((slug) => {
    const verdict = findSourceVerdict(manifest, slug);
    if (!verdict) {
      throw new Error(
        `${definition.key} references ${slug}, but OVE-79 has no source verdict for it.`,
      );
    }
    return {
      slug: verdict.slug,
      rawQuarantineAllowed: verdict.rawQuarantineAllowed,
      productProjectionAllowed: verdict.productProjectionAllowed,
      productProjectionMode: verdict.productProjectionMode,
      importWaves: verdict.importWaves,
      nextIssueDependency: verdict.nextIssueDependency,
    };
  });

  assertReadinessVerdictsAllowTarget(definition, readinessVerdicts);
  assertProjectionGuardAllowsTarget(definition);

  const report: CatalogFullImportDryRunTargetReport = {
    key: definition.key,
    packageScript: definition.packageScript,
    sourceSet: definition.sourceSet,
    importerIssue: definition.importerIssue,
    downstreamIssue: definition.downstreamIssue,
    projectionScope: definition.projectionScope,
    sources: [...definition.sourceSlugs],
    readinessVerdicts,
    counts: definition.rowCounts,
    parserVersions: [...definition.parserVersions],
    projectionGuard: {
      status: "passed",
      checkedProjectionRequests: definition.projectionRequests.length,
    },
    leakCheck: {
      status: "passed",
      forbiddenMarkerCount: FORBIDDEN_DRY_RUN_EVIDENCE_MARKERS.length,
    },
  };

  assertNoForbiddenCatalogFullImportDryRunEvidence(report);
  return report;
}

function applyEuOfficialJournalParserQaToTarget(
  target: CatalogFullImportDryRunTargetReport,
  sourceInventory: CatalogFullImportDryRunSourceInventory,
): CatalogFullImportDryRunTargetReport {
  if (!sourceInventory.parserQa) {
    return {
      ...target,
      sourceInventory,
    };
  }

  const totals = sourceInventory.parserQa.totals;

  return {
    ...target,
    counts: {
      sourceRowsWouldRead: totals.parsedRows,
      rawRowsWouldCapture: totals.parsedRows,
      productConceptsWouldProject: totals.acceptedRows,
      aliasesWouldProject: totals.acceptedRows,
      reviewNeededRows: totals.reviewNeededRows,
      rejectedRows: totals.rejectedRows,
      blockedRows: totals.reviewNeededRows + totals.rejectedRows,
      attributionRequiredSources: 1,
    },
    parserVersions: dedupeStrings([
      ...target.parserVersions,
      sourceInventory.parserQa.parserVersion,
    ]),
    sourceInventory,
  };
}

function applyBgOfficialVarietiesParserQaToTarget(
  target: CatalogFullImportDryRunTargetReport,
  sourceInventory: CatalogFullImportDryRunSourceInventory,
): CatalogFullImportDryRunTargetReport {
  const bgCounts = sourceInventory.parserQa?.byCountry.find(
    (row) => row.countryCode === "BG",
  );
  if (!sourceInventory.parserQa || !bgCounts) {
    return {
      ...target,
      sourceInventory,
    };
  }

  return {
    ...target,
    counts: {
      sourceRowsWouldRead: bgCounts.rows,
      rawRowsWouldCapture: bgCounts.rows,
      productConceptsWouldProject: bgCounts.acceptedRows,
      aliasesWouldProject: bgCounts.acceptedRows,
      reviewNeededRows: bgCounts.reviewNeededRows,
      rejectedRows: bgCounts.rejectedRows,
      blockedRows: bgCounts.reviewNeededRows + bgCounts.rejectedRows,
      attributionRequiredSources: 1,
    },
    parserVersions: dedupeStrings([
      ...target.parserVersions,
      sourceInventory.parserQa.parserVersion,
    ]),
    sourceInventory,
  };
}

function assertReadinessVerdictsAllowTarget(
  definition: CatalogFullImportDryRunTargetDefinition,
  verdicts: CatalogFullImportDryRunTargetReport["readinessVerdicts"],
) {
  for (const verdict of verdicts) {
    if (definition.rowCounts.rawRowsWouldCapture > 0) {
      if (!verdict.rawQuarantineAllowed) {
        throw new Error(
          `${definition.key} cannot capture ${verdict.slug}: OVE-79 does not allow raw quarantine for this source.`,
        );
      }
    }

    if (
      definition.projectionScope === "full_import_wave" &&
      definition.rowCounts.productConceptsWouldProject > 0 &&
      !verdict.productProjectionAllowed
    ) {
      throw new Error(
        `${definition.key} cannot project ${verdict.slug}: OVE-79 keeps this source out of full product projection until ${verdict.nextIssueDependency}.`,
      );
    }
  }
}

function assertProjectionGuardAllowsTarget(
  definition: CatalogFullImportDryRunTargetDefinition,
) {
  for (const request of definition.projectionRequests) {
    const decision = checkCatalogSourceProductProjection(request);
    if (!decision.allowed) {
      throw new Error(
        `${definition.key} projection guard blocked ${request.sourceSlug}: ${decision.message}`,
      );
    }
  }
}

function buildTotals(
  targets: CatalogFullImportDryRunTargetReport[],
): CatalogFullImportDryRunReport["totals"] {
  const empty = {
    targets: targets.length,
    readinessSources: new Set(
      targets.flatMap((target) =>
        target.readinessVerdicts.map((verdict) => verdict.slug),
      ),
    ).size,
    sourceRowsWouldRead: 0,
    rawRowsWouldCapture: 0,
    productConceptsWouldProject: 0,
    aliasesWouldProject: 0,
    reviewNeededRows: 0,
    rejectedRows: 0,
    blockedRows: 0,
    attributionRequiredSources: 0,
  };

  return targets.reduce((totals, target) => {
    totals.sourceRowsWouldRead += target.counts.sourceRowsWouldRead;
    totals.rawRowsWouldCapture += target.counts.rawRowsWouldCapture;
    totals.productConceptsWouldProject +=
      target.counts.productConceptsWouldProject;
    totals.aliasesWouldProject += target.counts.aliasesWouldProject;
    totals.reviewNeededRows += target.counts.reviewNeededRows;
    totals.rejectedRows += target.counts.rejectedRows;
    totals.blockedRows += target.counts.blockedRows;
    totals.attributionRequiredSources +=
      target.counts.attributionRequiredSources;
    return totals;
  }, empty);
}

function buildDuplicateRiskClusters(
  definitions: readonly CatalogFullImportDryRunTargetDefinition[],
): CatalogFullImportDryRunReport["duplicateRisk"]["clusters"] {
  const bySignal = new Map<
    string,
    Array<{ target: string; conceptRole: string }>
  >();

  for (const definition of definitions) {
    for (const signal of definition.duplicateSignals) {
      const members = bySignal.get(signal.signal) ?? [];
      members.push({
        target: definition.key,
        conceptRole: signal.conceptRole,
      });
      bySignal.set(signal.signal, members);
    }
  }

  return [...bySignal.entries()].flatMap(([signal, members]) => {
    return [
      {
        signal,
        riskLevel: "review_needed" as const,
        reason:
          members.length > 1
            ? "Multiple import targets share an identity signal; OVE-89 must review whether this is a safe species/variety boundary or a duplicate concept before production proof."
            : "One import target reports an internal duplicate or boundary signal; OVE-89 must review it before production proof trusts the broader projection.",
        members,
        requiredGate: "OVE-89" as const,
      },
    ];
  });
}

function findSourceVerdict(
  manifest: CatalogFullImportDryRunManifest,
  slug: string,
) {
  return manifest.fullImportReadiness.sourceVerdicts.find(
    (verdict) => verdict.slug === slug,
  );
}

function assertReadinessGate(manifest: CatalogFullImportDryRunManifest) {
  if (manifest.fullImportReadiness.issue !== "OVE-79") {
    throw new Error("Dry-run requires the OVE-79 full-import readiness gate.");
  }
  if (!manifest.fullImportReadiness.verificationDate) {
    throw new Error("OVE-79 readiness gate is missing verification date.");
  }
}

function parseEnvironment(
  value: string | undefined,
  optionName: string,
): CatalogFullImportDryRunEnvironment {
  if (
    CATALOG_FULL_IMPORT_DRY_RUN_ENVIRONMENTS.includes(
      value as CatalogFullImportDryRunEnvironment,
    )
  ) {
    return value as CatalogFullImportDryRunEnvironment;
  }

  throw new Error(
    `${optionName} must be one of: ${CATALOG_FULL_IMPORT_DRY_RUN_ENVIRONMENTS.join(
      ", ",
    )}.`,
  );
}

function parseTarget(
  value: string | undefined,
  optionName: string,
): CatalogFullImportDryRunTarget {
  if (
    CATALOG_FULL_IMPORT_DRY_RUN_TARGETS.includes(
      value as CatalogFullImportDryRunTarget,
    )
  ) {
    return value as CatalogFullImportDryRunTarget;
  }

  throw new Error(
    `${optionName} must be one of: ${CATALOG_FULL_IMPORT_DRY_RUN_TARGETS.join(
      ", ",
    )}.`,
  );
}

function dedupeTargets(
  targets: CatalogFullImportDryRunTarget[],
): CatalogFullImportDryRunTarget[] {
  return [...new Set(targets)];
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

async function buildEuOfficialJournalCommonCatalogueInventory(
  fetchImpl: CatalogFullImportDryRunFetch,
): Promise<CatalogFullImportDryRunSourceInventory> {
  const discovery = await fetchTextArtifact(
    fetchImpl,
    DG_SANTE_COMMON_CATALOGUE_URL,
  );
  const candidates = discovery.ok
    ? selectLatestSupplementCandidates(discovery.text)
    : [];
  const reviewNeeded: string[] = [];

  if (!discovery.ok) {
    reviewNeeded.push(
      `DG SANTE Common Catalogue page returned ${discovery.httpStatus ?? "network error"}; operator must re-run before parser work.`,
    );
  }

  for (const supplementType of [
    "agricultural_supplement_a",
    "vegetable_supplement_h",
  ] as const) {
    if (
      !candidates.some(
        (candidate) => candidate.supplementType === supplementType,
      )
    ) {
      reviewNeeded.push(
        `No latest ${supplementType} EUR-Lex link was discovered from DG SANTE; do not silently skip this supplement family.`,
      );
    }
  }

  const enrichedCandidates = await Promise.all(
    candidates.map((candidate) =>
      buildEuOfficialJournalCandidate(fetchImpl, candidate),
    ),
  );
  for (const candidate of enrichedCandidates) {
    if (!candidate.parserQa) {
      reviewNeeded.push(
        `${candidate.label} needs review because the preferred Formex ZIP parser path was unavailable or ambiguous.`,
      );
      continue;
    }

    if (
      candidate.parserQa.totals.reviewNeededRows > 0 ||
      candidate.parserQa.totals.rejectedRows > 0
    ) {
      reviewNeeded.push(
        `${candidate.label} parser QA reported ${candidate.parserQa.totals.reviewNeededRows} review-needed rows and ${candidate.parserQa.totals.rejectedRows} rejected rows before product projection.`,
      );
    }
  }
  const parserQa = buildEuOfficialJournalSourceParserQa(enrichedCandidates);

  return {
    issue: "OVE-102",
    status: reviewNeeded.length > 0 ? "review_needed" : "passed",
    discoverySource: {
      url: DG_SANTE_COMMON_CATALOGUE_URL,
      fetched: discovery.ok,
      httpStatus: discovery.httpStatus,
      contentType: discovery.contentType,
      byteLength: discovery.byteLength,
      checksumSha256: discovery.checksumSha256,
      candidateLinksFound: candidates.length,
    },
    fetchStrategy: {
      preferredArtifactOrder: [
        "Publications Office Formex XML ZIP discovered from the EUR-Lex XML notice",
        "EUR-Lex XML notice from legal-content/.../TXT/XML for manifestation discovery",
        "Cellar REST/SPARQL or data.europa.eu ELI link for work/expression metadata",
        "EUR-Lex HTML source page for OJ citation and fallback metadata",
        "Authentic OJ PDF only as a human/legal fallback when Formex/XML is unavailable",
      ],
      notes: [
        "This target fetches public official EUR-Lex/OJ artifacts, parses Formex XML rows for operator QA, and reports OVE-103 accepted-row projection counts without mutating data.",
        "Unavailable or ambiguous Formex paths, HTML-only evidence, and PDF-only evidence are reported as review-needed before OVE-103 import work.",
      ],
    },
    candidates: enrichedCandidates,
    ...(parserQa ? { parserQa } : {}),
    reviewNeeded,
  };
}

async function buildEuOfficialJournalCandidate(
  fetchImpl: CatalogFullImportDryRunFetch,
  candidate: {
    label: string;
    supplementType: EuCommonCatalogueSupplementType;
    eurLexUrl: string;
  },
): Promise<CatalogFullImportDryRunSourceInventoryCandidate> {
  const page = await fetchTextArtifact(fetchImpl, candidate.eurLexUrl);
  const derived = deriveEurLexIdentifiers(candidate.eurLexUrl);
  const title = page.ok ? readEurLexEnglishTitle(page.text) : null;
  const celexId = page.ok
    ? (readFirstMatch(page.text, /CELEX:([^"&<\s]+)/) ??
      readFirstMatch(page.text, /resource\/celex\/([^"<\s]+)/))
    : null;
  const normalizedCelexId = celexId
    ? decodeURIComponent(celexId)
    : derived.celexId;
  const eliUrl = page.ok
    ? (readFirstMatch(
        page.text,
        /href="(http:\/\/data\.europa\.eu\/eli\/C\/\d+\/\d+\/oj)"/,
      ) ??
      readFirstMatch(
        page.text,
        /about="(http:\/\/data\.europa\.eu\/eli\/C\/\d+\/\d+\/oj)"/,
      ))
    : derived.eliUrl;
  const ojCitation = page.ok
    ? normalizeRdfText(
        readFirstMatch(
          page.text,
          /(OJ C,\s*C\/\d+\/\d+,\s*\d{1,2}\.\d{1,2}\.\d{4})/,
        ),
      )
    : null;
  const publicationDate = ojCitation
    ? parseEuropeanDate(readFirstMatch(ojCitation, /(\d{1,2}\.\d{1,2}\.\d{4})/))
    : null;
  const pdfUrl = page.ok
    ? (readFirstMatch(
        page.text,
        /href="(https:\/\/eur-lex\.europa\.eu\/eli\/C\/\d+\/\d+\/oj\/eng\/pdf)"/,
      ) ?? `${candidate.eurLexUrl.replace(/\/$/, "")}/eng/pdf`)
    : `${candidate.eurLexUrl.replace(/\/$/, "")}/eng/pdf`;
  const xmlUrl = normalizedCelexId
    ? `https://eur-lex.europa.eu/legal-content/EN/TXT/XML/?uri=CELEX:${normalizedCelexId}`
    : null;
  const celexUrl = normalizedCelexId
    ? `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${normalizedCelexId}`
    : null;
  const celexRdfUrl = normalizedCelexId
    ? `http://publications.europa.eu/resource/celex/${encodeURIComponent(
        normalizedCelexId,
      )}`
    : null;
  const xml = xmlUrl ? await fetchTextArtifact(fetchImpl, xmlUrl) : null;
  const celexRdf = celexRdfUrl
    ? await fetchTextArtifact(fetchImpl, celexRdfUrl)
    : null;
  const formexZipUrl = xml?.ok ? readFormexZipUrl(xml.text) : null;
  const formexZip = formexZipUrl
    ? await fetchTextArtifact(fetchImpl, formexZipUrl)
    : null;
  const parserResult =
    formexZip?.ok && formexZip.checksumSha256
      ? parseCandidateFormexZip({
          candidate,
          formexZipBuffer: formexZip.buffer,
          sourceUrl: candidate.eurLexUrl,
          ojCitation,
          publicationDate,
          artifactChecksumSha256: formexZip.checksumSha256,
        })
      : null;
  const parserQa = parserResult?.ok
    ? buildCandidateParserQa(parserResult.result)
    : null;
  const rdfPublicationDate = celexRdf?.ok
    ? readFirstMatch(
        celexRdf.text,
        /<[^>]*date_document[^>]*>(\d{4}-\d{2}-\d{2})<\/[^>]+>/,
      )
    : null;
  const rdfTitle = celexRdf?.ok
    ? readFirstMatch(
        celexRdf.text,
        /<[^>]*title xml:lang="en">([^<]+)<\/[^>]+>/,
      )
    : null;
  const cellarId =
    (page.ok
      ? (readFirstMatch(page.text, /legalContentId=cellar:([a-f0-9-]+)/) ??
        readFirstMatch(page.text, /resource\/cellar\/([a-f0-9-]+)/))
      : null) ??
    (xml?.ok
      ? (readFirstMatch(xml.text, /resource\/cellar\/([a-f0-9-]+)/) ??
        readFirstMatch(xml.text, /<IDENTIFIER>([a-f0-9-]{36})<\/IDENTIFIER>/))
      : null) ??
    (celexRdf?.ok
      ? readFirstMatch(celexRdf.text, /resource\/cellar\/([a-f0-9-]+)/)
      : null);

  const xmlArtifact: CatalogFullImportDryRunSourceInventoryArtifact = xmlUrl
    ? {
        format: "xml_notice",
        role: "preferred_machine_readable",
        url: xmlUrl,
        fetchStatus: xml?.ok ? "fetched" : "review_needed",
        parseStatus: "not_parsed_dry_run_only",
        httpStatus: xml?.httpStatus ?? null,
        contentType: xml?.contentType ?? null,
        byteLength: xml?.byteLength ?? null,
        checksumSha256: xml?.ok ? xml.checksumSha256 : null,
      }
    : {
        format: "xml_notice",
        role: "preferred_machine_readable",
        url: null,
        fetchStatus: "review_needed",
        parseStatus: "not_parsed_dry_run_only",
        httpStatus: null,
        contentType: null,
        byteLength: null,
        checksumSha256: null,
      };
  const formexArtifact: CatalogFullImportDryRunSourceInventoryArtifact =
    formexZipUrl
      ? {
          format: "formex_zip",
          role: "preferred_machine_readable",
          url: formexZipUrl,
          fetchStatus: formexZip?.ok && parserQa ? "fetched" : "review_needed",
          parseStatus:
            formexZip?.ok && parserQa
              ? "parser_qa_parsed"
              : "fallback_review_needed",
          httpStatus: formexZip?.httpStatus ?? null,
          contentType: formexZip?.contentType ?? null,
          byteLength: formexZip?.byteLength ?? null,
          checksumSha256: formexZip?.ok ? formexZip.checksumSha256 : null,
        }
      : {
          format: "formex_zip",
          role: "preferred_machine_readable",
          url: null,
          fetchStatus: "review_needed",
          parseStatus: "fallback_review_needed",
          httpStatus: null,
          contentType: null,
          byteLength: null,
          checksumSha256: null,
        };
  const reviewStatus =
    page.ok &&
    normalizedCelexId &&
    eliUrl &&
    (publicationDate ?? rdfPublicationDate) &&
    xmlArtifact.fetchStatus === "fetched" &&
    formexArtifact.fetchStatus === "fetched" &&
    parserQa &&
    parserQa.totals.parsedRows > 0
      ? "parser_qa_reported"
      : "review_needed";
  const parseStatus =
    reviewStatus === "parser_qa_reported"
      ? "formex_parser_qa_reported"
      : "parser_qa_review_needed";

  return {
    sourceFamily: "eu-official-journal-common-catalogue",
    supplementType: candidate.supplementType,
    label: candidate.label,
    title:
      title ?? normalizeRdfText(rdfTitle) ?? fallbackSupplementTitle(candidate),
    publicationDate: publicationDate ?? rdfPublicationDate,
    language: "EN",
    eurLexUrl: candidate.eurLexUrl,
    ojUrl: candidate.eurLexUrl,
    ojCitation,
    eliUrl,
    celexId: normalizedCelexId,
    celexUrl,
    cellarId,
    artifacts: [
      {
        format: "html",
        role: "source_page",
        url: candidate.eurLexUrl,
        fetchStatus: page.ok ? "fetched" : "review_needed",
        parseStatus: "metadata_parsed",
        httpStatus: page.httpStatus,
        contentType: page.contentType,
        byteLength: page.byteLength,
        checksumSha256: page.ok ? page.checksumSha256 : null,
      },
      xmlArtifact,
      formexArtifact,
      {
        format: "celex_rdf",
        role: "metadata_fallback",
        url: celexRdfUrl,
        fetchStatus: celexRdf?.ok ? "fetched" : "review_needed",
        parseStatus: celexRdf?.ok
          ? "metadata_parsed"
          : "not_parsed_dry_run_only",
        httpStatus: celexRdf?.httpStatus ?? null,
        contentType: celexRdf?.contentType ?? null,
        byteLength: celexRdf?.byteLength ?? null,
        checksumSha256: celexRdf?.ok ? celexRdf.checksumSha256 : null,
      },
      {
        format: "pdf",
        role: "authentic_oj_fallback",
        url: pdfUrl,
        fetchStatus: pdfUrl ? "available_not_fetched" : "review_needed",
        parseStatus: "not_machine_preferred",
        httpStatus: null,
        contentType: null,
        byteLength: null,
        checksumSha256: null,
      },
    ],
    fetchStatus:
      reviewStatus === "parser_qa_reported" ? "fetched" : "review_needed",
    parseStatus,
    reviewStatus,
    ...(parserQa ? { parserQa } : {}),
  };
}

function parseCandidateFormexZip(input: {
  candidate: {
    label: string;
    supplementType: EuCommonCatalogueSupplementType;
  };
  formexZipBuffer: Buffer;
  sourceUrl: string;
  ojCitation: string | null;
  publicationDate: string | null;
  artifactChecksumSha256: string;
}):
  | {
      ok: true;
      result: EuCommonCatalogueParserResult;
    }
  | {
      ok: false;
    } {
  try {
    const formexXmlFiles = extractFormexXmlFilesFromZip(input.formexZipBuffer);
    if (formexXmlFiles.length === 0) {
      return { ok: false };
    }

    const result = parseEuCommonCatalogueFormex({
      supplementType: input.candidate.supplementType,
      supplementLabel: input.candidate.label,
      formexXmlFiles,
      sourceUrl: input.sourceUrl,
      ojCitation: input.ojCitation,
      publicationDate: input.publicationDate,
      artifactChecksumSha256: input.artifactChecksumSha256,
    });

    return result.totals.parsedRows > 0 ? { ok: true, result } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function buildCandidateParserQa(
  result: EuCommonCatalogueParserResult,
): CatalogFullImportDryRunCandidateParserQa {
  return {
    parserVersion: result.parserVersion,
    thresholds: result.thresholds,
    totals: result.totals,
    bySpeciesOrCrop: result.bySpeciesOrCrop,
    byCountry: result.byCountry,
    byNotifier: result.byNotifier,
    byConfidenceBucket: result.byConfidenceBucket,
    sampleRows: selectParserQaSampleRows(result.rows),
  };
}

function buildEuOfficialJournalSourceParserQa(
  candidates: CatalogFullImportDryRunSourceInventoryCandidate[],
): CatalogFullImportDryRunSourceParserQa | null {
  const sampleRows = candidates.flatMap(
    (candidate) => candidate.parserQa?.sampleRows ?? [],
  );
  const parserCandidates = candidates.filter((candidate) => candidate.parserQa);

  if (parserCandidates.length === 0) return null;

  const allTotals = parserCandidates.reduce(
    (totals, candidate) => {
      const candidateTotals = candidate.parserQa?.totals;
      if (!candidateTotals) return totals;
      totals.parsedRows += candidateTotals.parsedRows;
      totals.acceptedRows += candidateTotals.acceptedRows;
      totals.reviewNeededRows += candidateTotals.reviewNeededRows;
      totals.rejectedRows += candidateTotals.rejectedRows;
      return totals;
    },
    {
      parsedRows: 0,
      acceptedRows: 0,
      reviewNeededRows: 0,
      rejectedRows: 0,
    },
  );

  return {
    issue: "OVE-102",
    status:
      allTotals.reviewNeededRows > 0 || allTotals.rejectedRows > 0
        ? "review_needed"
        : "passed",
    parserVersion: EU_COMMON_CATALOGUE_FORMEX_PARSER_VERSION,
    thresholds: EU_COMMON_CATALOGUE_CONFIDENCE_THRESHOLDS,
    totals: allTotals,
    bySupplement: parserCandidates.map((candidate) => ({
      supplementLabel: candidate.label,
      rows: candidate.parserQa?.totals.parsedRows ?? 0,
      acceptedRows: candidate.parserQa?.totals.acceptedRows ?? 0,
      reviewNeededRows: candidate.parserQa?.totals.reviewNeededRows ?? 0,
      rejectedRows: candidate.parserQa?.totals.rejectedRows ?? 0,
    })),
    bySpeciesOrCrop: aggregateSpeciesSummaries(
      parserCandidates.flatMap(
        (candidate) => candidate.parserQa?.bySpeciesOrCrop ?? [],
      ),
    ),
    byCountry: aggregateCountrySummaries(
      parserCandidates.flatMap(
        (candidate) => candidate.parserQa?.byCountry ?? [],
      ),
    ),
    byNotifier: aggregateNotifierSummaries(
      parserCandidates.flatMap(
        (candidate) => candidate.parserQa?.byNotifier ?? [],
      ),
    ),
    byConfidenceBucket: aggregateConfidenceBucketSummaries(
      parserCandidates.flatMap(
        (candidate) => candidate.parserQa?.byConfidenceBucket ?? [],
      ),
    ),
    sampleRows: selectSourceParserQaSampleRows(sampleRows),
    reviewNeeded: candidates.flatMap((candidate) => {
      const count = candidate.parserQa?.totals.reviewNeededRows ?? 0;
      return count > 0
        ? [`${candidate.label}: ${count} parser rows need operator review.`]
        : [];
    }),
    rejected: candidates.flatMap((candidate) => {
      const count = candidate.parserQa?.totals.rejectedRows ?? 0;
      return count > 0
        ? [`${candidate.label}: ${count} parser rows were rejected.`]
        : [];
    }),
  };
}

function selectParserQaSampleRows(
  rows: readonly EuCommonCatalogueParsedRow[],
): CatalogFullImportDryRunParserQaSampleRow[] {
  const selectedRows = [
    ...rows.filter((row) => row.confidenceBucket === "accepted").slice(0, 6),
    ...rows
      .filter((row) => row.confidenceBucket === "review_needed")
      .slice(0, 6),
    ...rows.filter((row) => row.confidenceBucket === "rejected").slice(0, 6),
  ];

  return selectedRows.map((row) => ({
    supplementType: row.supplementType,
    supplementLabel: row.supplementLabel,
    varietyDenomination: row.varietyDenomination,
    speciesOrCrop: row.speciesOrCrop,
    countryCode: row.countryCode,
    notifierCode: row.notifierCode,
    admissionAction: row.admissionAction,
    marketExtensionDate: row.marketExtensionDate,
    registerType: row.registerType,
    ojCitation: row.ojCitation,
    sourceUrl: row.sourceUrl,
    publicationDate: row.publicationDate,
    artifactChecksumSha256: row.artifactChecksumSha256,
    parserVersion: row.parserVersion,
    extractionConfidence: row.extractionConfidence,
    confidenceBucket: row.confidenceBucket,
    statusReasons: row.statusReasons,
  }));
}

function selectSourceParserQaSampleRows(
  rows: readonly CatalogFullImportDryRunParserQaSampleRow[],
): CatalogFullImportDryRunParserQaSampleRow[] {
  return [
    ...rows.filter((row) => row.confidenceBucket === "accepted").slice(0, 8),
    ...rows
      .filter((row) => row.confidenceBucket === "review_needed")
      .slice(0, 8),
    ...rows.filter((row) => row.confidenceBucket === "rejected").slice(0, 8),
  ];
}

function aggregateSpeciesSummaries(
  summaries: EuCommonCatalogueParserResult["bySpeciesOrCrop"],
): EuCommonCatalogueParserResult["bySpeciesOrCrop"] {
  const bySpecies = new Map<
    string,
    EuCommonCatalogueParserResult["bySpeciesOrCrop"][number]
  >();

  for (const summary of summaries) {
    const existing = bySpecies.get(summary.speciesOrCrop);
    bySpecies.set(
      summary.speciesOrCrop,
      existing
        ? addSummaryCounts(existing, summary)
        : {
            ...summary,
          },
    );
  }

  return [...bySpecies.values()].sort(sortParserQaSummaryRows);
}

function aggregateCountrySummaries(
  summaries: EuCommonCatalogueParserResult["byCountry"],
): EuCommonCatalogueParserResult["byCountry"] {
  const byCountry = new Map<
    string,
    EuCommonCatalogueParserResult["byCountry"][number]
  >();

  for (const summary of summaries) {
    const existing = byCountry.get(summary.countryCode);
    byCountry.set(
      summary.countryCode,
      existing
        ? addSummaryCounts(existing, summary)
        : {
            ...summary,
          },
    );
  }

  return [...byCountry.values()].sort(sortParserQaSummaryRows);
}

function aggregateNotifierSummaries(
  summaries: EuCommonCatalogueParserResult["byNotifier"],
): EuCommonCatalogueParserResult["byNotifier"] {
  const byNotifier = new Map<
    string,
    EuCommonCatalogueParserResult["byNotifier"][number]
  >();

  for (const summary of summaries) {
    const existing = byNotifier.get(summary.notifierCode);
    byNotifier.set(
      summary.notifierCode,
      existing
        ? {
            ...addSummaryCounts(existing, summary),
            countryCode: existing.countryCode ?? summary.countryCode,
          }
        : {
            ...summary,
          },
    );
  }

  return [...byNotifier.values()].sort(sortParserQaSummaryRows);
}

function aggregateConfidenceBucketSummaries(
  summaries: EuCommonCatalogueParserResult["byConfidenceBucket"],
): EuCommonCatalogueParserResult["byConfidenceBucket"] {
  return (["accepted", "review_needed", "rejected"] as const).map((bucket) => ({
    bucket,
    rows: summaries
      .filter((summary) => summary.bucket === bucket)
      .reduce((total, summary) => total + summary.rows, 0),
  }));
}

function addSummaryCounts<
  TSummary extends {
    rows: number;
    acceptedRows: number;
    reviewNeededRows: number;
    rejectedRows: number;
  },
>(left: TSummary, right: TSummary): TSummary {
  return {
    ...left,
    rows: left.rows + right.rows,
    acceptedRows: left.acceptedRows + right.acceptedRows,
    reviewNeededRows: left.reviewNeededRows + right.reviewNeededRows,
    rejectedRows: left.rejectedRows + right.rejectedRows,
  } as TSummary;
}

function sortParserQaSummaryRows<
  TRow extends {
    rows: number;
  },
>(left: TRow, right: TRow) {
  if (left.rows !== right.rows) return right.rows - left.rows;
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function selectLatestSupplementCandidates(html: string): Array<{
  label: string;
  supplementType: EuCommonCatalogueSupplementType;
  eurLexUrl: string;
}> {
  type SupplementAnchor = {
    href: string;
    text: string;
    supplementLetter: string;
    year: number;
    number: number;
  };

  const anchors = [
    ...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g),
  ]
    .map((match) => {
      const text = decodeHtml(match[2].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      const supplementMatch = /^Supplement ([AH]) (\d{4})\/(\d+)$/.exec(text);
      return {
        href: decodeHtml(match[1]),
        text,
        supplementLetter: supplementMatch?.[1] ?? null,
        year: supplementMatch ? Number(supplementMatch[2]) : null,
        number: supplementMatch ? Number(supplementMatch[3]) : null,
      };
    })
    .filter((anchor): anchor is SupplementAnchor => {
      return (
        anchor.supplementLetter !== null &&
        anchor.year !== null &&
        anchor.number !== null
      );
    })
    .sort((left, right) => {
      if (left.year !== right.year) return right.year - left.year;
      return right.number - left.number;
    });
  const selected: Array<{
    label: string;
    supplementType: EuCommonCatalogueSupplementType;
    eurLexUrl: string;
  }> = [];

  for (const supplementType of [
    "agricultural_supplement_a",
    "vegetable_supplement_h",
  ] as const) {
    const supplementLetter =
      supplementType === "agricultural_supplement_a" ? "A" : "H";
    const anchor = anchors.find(
      (item) => item.supplementLetter === supplementLetter,
    );
    if (!anchor) continue;

    selected.push({
      label: anchor.text,
      supplementType,
      eurLexUrl: new URL(anchor.href, DG_SANTE_COMMON_CATALOGUE_URL).href,
    });
  }

  return selected;
}

async function fetchTextArtifact(
  fetchImpl: CatalogFullImportDryRunFetch,
  url: string,
) {
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "text/html,application/xml,text/xml,*/*",
        "user-agent":
          "OverGarden OVE-102 EUR-Lex OJ parser QA dry-run (contact via over.garden)",
      },
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      ok: response.status === 200 && buffer.length > 0,
      httpStatus: response.status,
      contentType: response.headers.get("content-type"),
      byteLength: buffer.length,
      checksumSha256: createHash("sha256").update(buffer).digest("hex"),
      buffer,
      text: buffer.toString("utf8"),
    };
  } catch {
    return {
      ok: false,
      httpStatus: null,
      contentType: null,
      byteLength: 0,
      checksumSha256: null,
      buffer: Buffer.alloc(0),
      text: "",
    };
  }
}

function readFirstMatch(text: string, pattern: RegExp): string | null {
  return pattern.exec(text)?.[1] ?? null;
}

function readEurLexEnglishTitle(html: string): string | null {
  return normalizeRdfText(
    readFirstMatch(
      html,
      /property="eli:title"\s+content="([^"]+)"\s+lang="en"/,
    ) ??
      readFirstMatch(
        html,
        /lang="en"\s+property="eli:title"\s+content="([^"]+)"/,
      ) ??
      readFirstMatch(html, /property="eli:title"\s+content="([^"]+)"/),
  );
}

function readFormexZipUrl(xmlNotice: string): string | null {
  return normalizeRdfText(
    readFirstMatch(
      xmlNotice,
      /(https?:\/\/publications\.europa\.eu\/resource\/oj\/[^"<\s]+?\.fmx4\.zip)/,
    ),
  );
}

function deriveEurLexIdentifiers(eurLexUrl: string): {
  celexId: string | null;
  eliUrl: string | null;
} {
  const match = /\/eli\/C\/(\d{4})\/(\d+)\/oj\/?$/.exec(eurLexUrl);
  if (!match) {
    return { celexId: null, eliUrl: null };
  }

  const [, year, naturalNumber] = match;
  return {
    celexId: `C/${year}/${naturalNumber.padStart(5, "0")}`,
    eliUrl: `http://data.europa.eu/eli/C/${year}/${Number(naturalNumber)}/oj`,
  };
}

function fallbackSupplementTitle(candidate: {
  label: string;
  supplementType: EuCommonCatalogueSupplementType;
}) {
  const family =
    candidate.supplementType === "agricultural_supplement_a"
      ? "agricultural plant species"
      : "vegetable species";
  return `Common catalogue of varieties of ${family} ${candidate.label}`;
}

function normalizeRdfText(value: string | null): string | null {
  if (!value) return null;
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function parseEuropeanDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
