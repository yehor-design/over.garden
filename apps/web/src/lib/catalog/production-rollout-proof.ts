import type { CatalogEntityResolutionQaReport } from "@/server/catalog-source/entity-resolution-qa-repository";

import type {
  CatalogSeedRolloutAppSmoke,
  CatalogSeedRolloutCodeState,
  CatalogSeedRolloutOptions,
} from "./seed-rollout-proof";
import { assertNoForbiddenCatalogSeedRolloutEvidence } from "./seed-rollout-proof";

export const CATALOG_PRODUCTION_ROLLOUT_REQUIRED_FAMILIES = [
  "OVE-81 UA State Register official variety wave",
  "OVE-58/82/83 species backbone and alias expansion",
  "OVE-60/86 approved bee and VBO breed seed",
  "OVE-85 EU OJ Bulgaria official varieties",
  "OVE-88 GRIN/NPGS promoted long-tail candidates",
  "OVE-89 entity-resolution QA",
] as const;

export interface CatalogProductionRolloutSearchCaseProof {
  key: string;
  query: string;
  expectedCanonicalName: string;
  expectedCatalogKind: "plant_variety" | "species" | "breed";
  expectedSource: string;
  postgresMatched: boolean;
  meilisearchMatched: boolean;
  postgresSuggestionCount: number;
  meilisearchSuggestionCount: number;
  duplicateSameConceptSuggestionsAbsent: boolean;
}

export interface CatalogProductionRolloutSearchProof {
  indexName: "catalog_typeahead";
  indexRefresh: {
    documentsIndexed: number;
    taskWaited: true;
  };
  postgresFallback: "checked";
  meilisearch: "checked";
  cases: CatalogProductionRolloutSearchCaseProof[];
  leakCheck: "passed";
}

export function buildCatalogProductionRolloutEvidence(input: {
  options: CatalogSeedRolloutOptions;
  codeState: CatalogSeedRolloutCodeState;
  seedRolloutEvidence: unknown;
  euOjImportOutput: unknown;
  bgOfficialVarietiesSmoke: unknown;
  entityResolutionQa: CatalogEntityResolutionQaReport;
  searchProof: CatalogProductionRolloutSearchProof;
  generatedAt: string;
}) {
  const seedRollout = buildSafeSeedRolloutSummary(input.seedRolloutEvidence);
  const euOjImport = buildSafeEuOjImportSummary(input.euOjImportOutput);
  const bgSmoke = buildSafeBgOfficialVarietiesSummary(
    input.bgOfficialVarietiesSmoke,
  );
  const entityResolutionQa = buildSafeEntityResolutionQaSummary(
    input.entityResolutionQa,
  );

  assertSearchProof(input.searchProof);

  const evidence = {
    schemaVersion: "ove90.fullCatalogProductionRolloutProof.v1",
    issue: "OVE-90",
    generatedAt: input.generatedAt,
    environment: {
      name: input.options.environment,
      baseUrl: input.options.baseUrl,
      databaseWriteScope:
        input.options.environment === "local"
          ? "explicit_local_environment"
          : "explicit_non_local_environment",
      nonLocalMutationGate:
        input.options.environment === "local"
          ? "not_required_for_local"
          : input.options.allowNonLocalMutation
            ? "explicitly_confirmed"
            : "missing",
      proofBoundary:
        "database_import_state_real_app_smoke_search_index_and_entity_resolution_qa",
    },
    code: input.codeState,
    prerequisites: {
      completedFamilies: CATALOG_PRODUCTION_ROLLOUT_REQUIRED_FAMILIES,
      previousProofSchemas: [
        seedRollout.schemaVersion,
        input.entityResolutionQa.schemaVersion,
      ],
    },
    proof: {
      seedRollout,
      euOjImport,
      bgOfficialVarietiesSmoke: bgSmoke,
      entityResolutionQa,
      searchAndIndex: input.searchProof,
      availability: {
        sampleCoversEveryCompletedImportFamily:
          seedRollout.seededFamilyCount >= 5 &&
          euOjImport.projectedConcepts > 0 &&
          bgSmoke.beyondSadovoProof &&
          entityResolutionQa.blockingClusterCount === 0 &&
          input.searchProof.cases.length >= 5 &&
          input.searchProof.cases.every(
            (result) =>
              result.postgresMatched &&
              result.meilisearchMatched &&
              result.duplicateSameConceptSuggestionsAbsent,
          ),
        duplicateSameConceptSuggestionsAbsent:
          seedRollout.duplicateSameConceptSuggestionsAbsent &&
          bgSmoke.duplicateSameConceptSuggestionsAbsent &&
          input.searchProof.cases.every(
            (result) => result.duplicateSameConceptSuggestionsAbsent,
          ),
        heldRejectedOrBlockedCandidatesAbsent:
          seedRollout.blockedAliasCasesAbsent &&
          bgSmoke.blockedRowsAbsent &&
          entityResolutionQa.blockedProjectionRowsKeptOutOfProductProof,
      },
    },
    evidenceSafety: "linear_safe_redacted",
    leakCheck: "passed",
  };

  if (
    !evidence.proof.availability.sampleCoversEveryCompletedImportFamily ||
    !evidence.proof.availability.duplicateSameConceptSuggestionsAbsent ||
    !evidence.proof.availability.heldRejectedOrBlockedCandidatesAbsent
  ) {
    throw new Error(
      "OVE-90 production rollout proof did not satisfy the gate.",
    );
  }

  assertNoForbiddenCatalogProductionRolloutEvidence(evidence);
  return evidence;
}

export function buildSafeSeedRolloutSummary(seedRolloutEvidence: unknown) {
  const root = requireRecord(seedRolloutEvidence, "seed rollout proof");
  const seedSet = requireRecord(root.seedSet, "seed rollout seed set");
  const seeded = requireArray(seedSet.seeded, "seed rollout seeded families");
  const proof = requireRecord(root.proof, "seed rollout proof block");
  const idempotency = requireRecord(proof.idempotency, "seed idempotency");
  const realAppSmoke = requireRecord(proof.realAppSmoke, "seed app smoke");
  requireArray(realAppSmoke.cases, "seed app smoke cases");
  const blockedAliasCases = Array.isArray(realAppSmoke.blockedAliasCases)
    ? realAppSmoke.blockedAliasCases
    : [];

  if (root.leakCheck !== "passed") {
    throw new Error("Seed rollout proof did not pass the leak check.");
  }
  if (realAppSmoke.leakCheck !== "passed") {
    throw new Error("Seed rollout real app smoke did not pass the leak check.");
  }
  if (idempotency.stableProductIdentityForSeedCommands !== true) {
    throw new Error("Seed rollout proof did not preserve product identities.");
  }
  if (idempotency.duplicateSameConceptSuggestionsAbsent !== true) {
    throw new Error("Seed rollout proof found duplicate same-concept results.");
  }

  return {
    schemaVersion: stringValue(root.schemaVersion) ?? "unknown",
    issue: stringValue(root.issue) ?? "unknown",
    seededFamilyCount: seeded.length,
    seededFamilies: seeded.map((family) => {
      const record = requireRecord(family, "seeded family");
      return {
        key: stringValue(record.key) ?? "unknown",
        sourceSet: stringValue(record.sourceSet) ?? "unknown",
        expectedCanonicalName:
          stringValue(record.expectedCanonicalName) ?? "unknown",
        catalogKind: stringValue(record.catalogKind) ?? "unknown",
        source: stringValue(record.source) ?? "unknown",
        aliasesProjected: nullableNumber(record.aliasesProjected),
        reindexQueued: nullableBoolean(record.reindexQueued),
        stableProductIdentityOnRerun:
          record.stableProductIdentityOnRerun === true,
        sourceProofRecorded: record.sourceProofRecorded === true,
        leakCheck: record.leakCheck === "passed" ? "passed" : "failed",
      };
    }),
    realAppSmoke: summarizeSeedAppSmoke(
      realAppSmoke as unknown as CatalogSeedRolloutAppSmoke,
    ),
    stableProductIdentityForSeedCommands: true,
    duplicateSameConceptSuggestionsAbsent: true,
    blockedAliasCasesAbsent: blockedAliasCases.every((caseOutput) => {
      const record = requireRecord(caseOutput, "blocked alias case");
      return (
        record.forbiddenDisplayNameAbsent === true &&
        record.duplicateSameConceptSuggestionsAbsent === true
      );
    }),
    leakCheck: "passed" as const,
  };
}

export function buildSafeEuOjImportSummary(output: unknown) {
  const root = requireRecord(output, "EU OJ import output");
  const imported = requireRecord(root.imported, "EU OJ import summary");
  const idempotencyProof = requireRecord(
    root.idempotencyProof,
    "EU OJ idempotency proof",
  );
  const typeaheadProof = requireRecord(root.typeaheadProof, "EU OJ typeahead");
  const provenanceProof = requireRecord(
    root.provenanceProof,
    "EU OJ provenance",
  );
  const blockedRecordProof = root.blockedRecordProof
    ? requireRecord(root.blockedRecordProof, "EU OJ blocked row proof")
    : null;

  if (root.leakCheck !== "passed") {
    throw new Error("EU OJ import output did not pass the leak check.");
  }
  const projectedConcepts = numberValue(imported.projectedConcepts);
  if (projectedConcepts === null || projectedConcepts <= 0) {
    throw new Error("EU OJ import did not project accepted concepts.");
  }
  if (idempotencyProof.rerunProjectedConcepts !== projectedConcepts) {
    throw new Error("EU OJ import did not report stable projected concepts.");
  }
  if (typeaheadProof.projectedAcceptedRowReachable !== true) {
    throw new Error("EU OJ accepted row was not reachable in typeahead.");
  }
  if (provenanceProof.hasRequiredCaveats !== true) {
    throw new Error("EU OJ import did not report required caveats.");
  }
  if (blockedRecordProof?.projectionStatus === "projected") {
    throw new Error("EU OJ blocked parser row reached product projection.");
  }

  return {
    sourcePath: "official_journal_eur_lex",
    projectedConcepts,
    recordsImported: numberValue(imported.sourceRecordsImported) ?? 0,
    aliasesProjected: numberValue(imported.aliasesProjected) ?? 0,
    sampleProjectedCanonicalName:
      stringValue(imported.sampleProjectedCanonicalName) ??
      stringValue(provenanceProof.canonicalName) ??
      "unknown",
    idempotentProjectedConcepts: true,
    typeaheadReachable: true,
    provenanceRecorded: true,
    requiredCaveatsRecorded: true,
    blockedParserRowsKeptOutOfProduct:
      blockedRecordProof === null ||
      blockedRecordProof.projectionStatus !== "projected",
    leakCheck: "passed" as const,
  };
}

export function buildSafeBgOfficialVarietiesSummary(output: unknown) {
  const root = requireRecord(output, "BG official varieties smoke output");
  const selected = requireRecord(
    root.selectedBgOfficialVariety,
    "selected BG official variety",
  );
  const sadovo = requireRecord(root.sadovoStabilityProof, "Sadovo proof");
  const blockedRowsProof = requireRecord(
    root.blockedRowsProof,
    "BG blocked rows proof",
  );
  const iasasOnlyRows = Array.isArray(
    blockedRowsProof.iasasOnlyRowsAbsentFromTypeahead,
  )
    ? blockedRowsProof.iasasOnlyRowsAbsentFromTypeahead
    : [];

  if (root.leakCheck !== "passed") {
    throw new Error("BG official varieties smoke did not pass the leak check.");
  }
  if (selected.beyondSadovoProof !== true) {
    throw new Error("BG official varieties smoke did not go beyond Sadovo 1.");
  }
  if (selected.duplicateSameConceptSuggestionsAbsent !== true) {
    throw new Error("BG official varieties smoke found duplicate suggestions.");
  }
  if (selected.sourceAttributionShown !== true) {
    throw new Error("BG official varieties smoke missed source attribution.");
  }
  if (selected.legalValueCaveatShown !== true) {
    throw new Error("BG official varieties smoke missed legal caveat.");
  }
  if (
    blockedRowsProof.reviewNeededAndRejectedOjRowsHaveNoProductLinks !== true ||
    numberValue(blockedRowsProof.blockedOjProjectionLeaks) !== 0 ||
    !iasasOnlyRows.every((row) => {
      const record = requireRecord(row, "IASAS absent proof");
      return record.iasasOnlyProjectionAbsent === true;
    })
  ) {
    throw new Error("BG blocked-row proof did not satisfy the gate.");
  }
  if (sadovo.stillSelectableAfterBgFullImport !== true) {
    throw new Error("Sadovo 1 stability proof failed after BG full import.");
  }

  return {
    selectedCanonicalName: stringValue(selected.canonicalName) ?? "unknown",
    selectedCatalogKind: stringValue(selected.catalogKind) ?? "unknown",
    selectedSource: stringValue(selected.source) ?? "unknown",
    projectedBgRows: numberValue(root.bgOfficialJournalRowsProjected) ?? 0,
    beyondSadovoProof: true,
    duplicateSameConceptSuggestionsAbsent: true,
    sourceAttributionShown: true,
    legalValueCaveatShown: true,
    sadovoStillSelectable: true,
    blockedRowsAbsent: true,
    leakCheck: "passed" as const,
  };
}

export function buildSafeEntityResolutionQaSummary(
  report: CatalogEntityResolutionQaReport,
) {
  if (report.leakCheck !== "passed") {
    throw new Error("Entity-resolution QA did not pass the leak check.");
  }
  const blockerGroups = report.summary.groups.filter(
    (group) =>
      (group.kind === "likely_duplicate" ||
        group.kind === "source_disagreement") &&
      group.count > 0,
  );
  if (blockerGroups.length > 0) {
    throw new Error(
      `Entity-resolution QA still has blocking clusters: ${blockerGroups
        .map((group) => group.kind)
        .join(", ")}.`,
    );
  }

  return {
    schemaVersion: report.schemaVersion,
    issue: report.issue,
    clusterCount: report.summary.clusterCount,
    sourceBackedCatalogRowsReviewed:
      report.summary.sourceBackedCatalogRowsReviewed,
    aliasCollisionRowsReviewed: report.summary.aliasCollisionRowsReviewed,
    sourceCandidateGroupsReviewed: report.summary.sourceCandidateGroupsReviewed,
    groups: report.summary.groups.map((group) => ({
      kind: group.kind,
      count: group.count,
      nextAction: group.nextAction,
    })),
    blockingClusterCount: 0,
    blockedProjectionRowsKeptOutOfProductProof: true,
    leakCheck: "passed" as const,
  };
}

export function assertNoForbiddenCatalogProductionRolloutEvidence(
  output: unknown,
) {
  assertNoForbiddenCatalogSeedRolloutEvidence(output);
  const text = JSON.stringify(output).toLowerCase();
  for (const marker of [
    "rawpayloadsha",
    "sourceurl",
    "licenseurl",
    "cookie",
    "secret",
    "meilisearch_api_key",
    "database_url",
    "postgres_url",
  ]) {
    if (text.includes(marker)) {
      throw new Error(
        `Production rollout evidence contains forbidden marker: ${marker}.`,
      );
    }
  }
}

function summarizeSeedAppSmoke(smoke: CatalogSeedRolloutAppSmoke) {
  return {
    baseUrl: smoke.baseUrl,
    caseCount: smoke.cases.length,
    cases: smoke.cases.map((caseOutput) => ({
      query: caseOutput.query,
      canonicalName: caseOutput.canonicalName,
      catalogKind: caseOutput.catalogKind,
      objectKind: caseOutput.objectKind,
      varietyState: caseOutput.varietyState,
      suggestionCount: caseOutput.suggestionCount,
      duplicateSameConceptSuggestionsAbsent:
        caseOutput.duplicateSameConceptSuggestionsAbsent,
      readbackIdentityPreserved: caseOutput.readbackIdentityPreserved,
      readbackPageStatus: caseOutput.readbackPageStatus,
    })),
    blockedAliasCaseCount: smoke.blockedAliasCases?.length ?? 0,
    leakCheck: smoke.leakCheck,
  };
}

function assertSearchProof(searchProof: CatalogProductionRolloutSearchProof) {
  if (searchProof.leakCheck !== "passed") {
    throw new Error("Search proof did not pass the leak check.");
  }
  if (searchProof.postgresFallback !== "checked") {
    throw new Error("Postgres fallback search proof was not checked.");
  }
  if (searchProof.meilisearch !== "checked") {
    throw new Error("Meilisearch proof was not checked.");
  }
  if (searchProof.indexRefresh.documentsIndexed <= 0) {
    throw new Error("Meilisearch index refresh did not index documents.");
  }
  if (searchProof.indexRefresh.taskWaited !== true) {
    throw new Error("Meilisearch index refresh task was not awaited.");
  }
  const failed = searchProof.cases.find(
    (caseProof) =>
      !caseProof.postgresMatched ||
      !caseProof.meilisearchMatched ||
      !caseProof.duplicateSameConceptSuggestionsAbsent,
  );
  if (failed) {
    throw new Error(`Search proof failed for ${failed.key}.`);
  }
}

function requireRecord(value: unknown, label: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a JSON array.`);
  }
  return value;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : numberValue(value);
}

function nullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}
