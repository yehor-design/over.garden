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
  checkCatalogSourceProductProjection,
  type CatalogSourceSpecificProjectionGate,
} from "@/server/catalog-source/source-projection-guard";

const MANIFEST_URL = new URL(
  "../../../../../docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json",
  import.meta.url,
);

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
  "genebank-long-tail",
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
        "OVE-86",
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
      sourceSet: "OVE-60 official bee breed seed",
      importerIssue: "OVE-60",
      downstreamIssue: "OVE-86",
      projectionScope: "bounded_existing_proof",
      sourceSlugs: [breedDefinition.source.slug],
      readinessSourceSlugs: [],
      rowCounts: {
        sourceRowsWouldRead: 1,
        rawRowsWouldCapture: 1,
        productConceptsWouldProject: 1,
        aliasesWouldProject: breedDefinition.projection.aliases.length,
        reviewNeededRows: breedDefinition.aliasCandidates.filter(
          (alias) => alias.status === "review_needed",
        ).length,
        rejectedRows: 0,
        blockedRows: breedDefinition.aliasCandidates.filter(
          (alias) => alias.status !== "accepted",
        ).length,
        attributionRequiredSources: breedDefinition.source.attributionRequired
          ? 1
          : 0,
      },
      parserVersions: [BREED_SEED_PARSER_VERSION],
      projectionRequests: [
        {
          sourceSlug: breedDefinition.source.slug,
          sourceVersion: breedDefinition.source.version,
          sourceRecordKey: breedDefinition.record.id,
          productSurface: "catalog_items",
          productSource: breedDefinition.projection.source,
          productSourceId: breedDefinition.projection.sourceId,
          explicitGate: {
            issueKey: "OVE-60",
            gateId: "ove-60-ua-official-bee-breed-manual-seed",
            scope: "manual_seed",
          },
        },
        {
          sourceSlug: breedDefinition.source.slug,
          sourceVersion: breedDefinition.source.version,
          sourceRecordKey: breedDefinition.record.id,
          productSurface: "catalog_item_names",
          productSource: breedDefinition.projection.source,
          productSourceId: breedDefinition.projection.sourceId,
          explicitGate: {
            issueKey: "OVE-60",
            gateId: "ove-60-ua-official-bee-breed-manual-seed",
            scope: "manual_seed",
          },
        },
      ],
      duplicateSignals: [],
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
      key: "genebank-long-tail",
      packageScript: "catalog:sources:import-genebank-long-tail",
      sourceSet: "OVE-62 GRIN/NPGS promoted long-tail candidate",
      importerIssue: "OVE-62",
      downstreamIssue: "OVE-88",
      projectionScope: "full_import_wave",
      sourceSlugs: [genebankDefinition.source.slug],
      readinessSourceSlugs: [genebankDefinition.source.slug],
      rowCounts: {
        sourceRowsWouldRead: genebankDefinition.records.length,
        rawRowsWouldCapture: genebankDefinition.records.length,
        productConceptsWouldProject: 1,
        aliasesWouldProject: genebankDefinition.promotion.aliases.length,
        reviewNeededRows: genebankDefinition.records.filter(
          (record) => record.id !== genebankDefinition.promotableRecordKey,
        ).length,
        rejectedRows: 0,
        blockedRows: genebankDefinition.records.filter(
          (record) => record.id !== genebankDefinition.promotableRecordKey,
        ).length,
        attributionRequiredSources: genebankDefinition.source
          .attributionRequired
          ? 1
          : 0,
      },
      parserVersions: [GENEBANK_LONG_TAIL_PARSER_VERSION],
      projectionRequests: [
        {
          sourceSlug: genebankDefinition.source.slug,
          productSurface: "catalog_items",
        },
        {
          sourceSlug: genebankDefinition.source.slug,
          productSurface: "catalog_item_names",
        },
      ],
      duplicateSignals: [
        {
          signal: "solanum-lycopersicum-boundary",
          conceptRole: "variety candidate under tomato species",
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
