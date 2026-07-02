import type {
  CatalogSeedRolloutCodeState,
  CatalogSeedRolloutOptions,
} from "./seed-rollout-proof";
import {
  assertNoForbiddenCatalogProductionRolloutEvidence,
  buildSafeBgOfficialVarietiesSummary,
} from "./production-rollout-proof";

export interface EuOjProductionUxSearchCaseProof {
  key: "eu-oj-bg-official-varieties";
  query: string;
  expectedCanonicalName: string;
  expectedCatalogKind: "plant_variety";
  expectedSource: "eu_oj_eur_lex_common_catalogue";
  postgresMatched: boolean;
  meilisearchMatched: boolean;
  postgresSuggestionCount: number;
  meilisearchSuggestionCount: number;
  duplicateSameConceptSuggestionsAbsent: boolean;
}

export interface EuOjProductionUxSearchBlockedQueryProof {
  query: string;
  postgresForbiddenSuggestionAbsent: boolean;
  meilisearchForbiddenSuggestionAbsent: boolean;
  duplicateSameConceptSuggestionsAbsent: boolean;
}

export interface EuOjProductionUxSearchProof {
  indexName: "catalog_typeahead";
  derivedIndexRefresh: {
    mode: "direct_safe_catalog_rebuild";
    documentsIndexed: number;
    taskWaited: true;
    meilisearchMatchedAfterRefresh: true;
  };
  postgresFallback: "checked";
  meilisearch: "checked";
  selectedCase: EuOjProductionUxSearchCaseProof;
  blockedRowsProof: {
    reviewNeededAndRejectedOjRowsHaveNoProductLinks: true;
    blockedOjProjectionLeaks: number;
    iasasOnlyRowsAbsentFromSearch: EuOjProductionUxSearchBlockedQueryProof[];
  };
  publicSafeMeiliHitContract: true;
  leakCheck: "passed";
}

export function buildEuOjProductionUxSearchEvidence(input: {
  options: CatalogSeedRolloutOptions;
  codeState: CatalogSeedRolloutCodeState;
  bgOfficialVarietiesSmoke: unknown;
  searchProof: EuOjProductionUxSearchProof;
  generatedAt: string;
}) {
  const bgSmoke = buildSafeBgOfficialVarietiesSummary(
    input.bgOfficialVarietiesSmoke,
  );
  assertSearchProof(input.searchProof, bgSmoke.selectedCanonicalName);

  const evidence = {
    schemaVersion: "ove106.euOjProductionUxSearchProof.v1",
    issue: "OVE-106",
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
        "production_garden_ux_postgres_fallback_direct_safe_meilisearch_rebuild",
    },
    code: input.codeState,
    proof: {
      productionGardenSmoke: bgSmoke,
      searchAndIndex: input.searchProof,
      availability: {
        euOjBgProductionFamilyCleared:
          bgSmoke.beyondSadovoProof &&
          bgSmoke.blockedRowsAbsent &&
          input.searchProof.selectedCase.postgresMatched &&
          input.searchProof.selectedCase.meilisearchMatched &&
          input.searchProof.selectedCase.duplicateSameConceptSuggestionsAbsent,
        duplicateSameConceptSuggestionsAbsent:
          bgSmoke.duplicateSameConceptSuggestionsAbsent &&
          input.searchProof.selectedCase
            .duplicateSameConceptSuggestionsAbsent &&
          input.searchProof.blockedRowsProof.iasasOnlyRowsAbsentFromSearch.every(
            (result) => result.duplicateSameConceptSuggestionsAbsent,
          ),
        heldRejectedOrBlockedCandidatesAbsent:
          bgSmoke.blockedRowsAbsent &&
          input.searchProof.blockedRowsProof
            .reviewNeededAndRejectedOjRowsHaveNoProductLinks &&
          input.searchProof.blockedRowsProof.blockedOjProjectionLeaks === 0 &&
          input.searchProof.blockedRowsProof.iasasOnlyRowsAbsentFromSearch.every(
            (result) =>
              result.postgresForbiddenSuggestionAbsent &&
              result.meilisearchForbiddenSuggestionAbsent,
          ),
        publicSafeMeiliHitContract:
          input.searchProof.publicSafeMeiliHitContract,
      },
      nextGate:
        "OVE-90 may rerun the final full-catalog production proof separately.",
    },
    evidenceSafety: "linear_safe_redacted",
    leakCheck: "passed",
  };

  if (
    !evidence.proof.availability.euOjBgProductionFamilyCleared ||
    !evidence.proof.availability.duplicateSameConceptSuggestionsAbsent ||
    !evidence.proof.availability.heldRejectedOrBlockedCandidatesAbsent ||
    !evidence.proof.availability.publicSafeMeiliHitContract
  ) {
    throw new Error(
      "OVE-106 production UX/search proof did not satisfy the gate.",
    );
  }

  assertNoForbiddenCatalogProductionRolloutEvidence(evidence);
  return evidence;
}

function assertSearchProof(
  searchProof: EuOjProductionUxSearchProof,
  expectedCanonicalName: string,
) {
  if (searchProof.leakCheck !== "passed") {
    throw new Error("OVE-106 search proof did not pass the leak check.");
  }
  if (searchProof.postgresFallback !== "checked") {
    throw new Error("OVE-106 Postgres fallback proof was not checked.");
  }
  if (searchProof.meilisearch !== "checked") {
    throw new Error("OVE-106 Meilisearch proof was not checked.");
  }
  if (searchProof.indexName !== "catalog_typeahead") {
    throw new Error("OVE-106 checked the wrong search index.");
  }
  if (
    searchProof.derivedIndexRefresh.mode !== "direct_safe_catalog_rebuild" ||
    searchProof.derivedIndexRefresh.documentsIndexed <= 0 ||
    searchProof.derivedIndexRefresh.taskWaited !== true ||
    searchProof.derivedIndexRefresh.meilisearchMatchedAfterRefresh !== true
  ) {
    throw new Error("OVE-106 derived catalog index refresh was not proven.");
  }
  if (searchProof.publicSafeMeiliHitContract !== true) {
    throw new Error("OVE-106 Meilisearch hit contract was not public-safe.");
  }
  if (
    searchProof.selectedCase.expectedCanonicalName !== expectedCanonicalName ||
    searchProof.selectedCase.query !== expectedCanonicalName ||
    searchProof.selectedCase.expectedCatalogKind !== "plant_variety" ||
    searchProof.selectedCase.expectedSource !==
      "eu_oj_eur_lex_common_catalogue" ||
    !searchProof.selectedCase.postgresMatched ||
    !searchProof.selectedCase.meilisearchMatched ||
    !searchProof.selectedCase.duplicateSameConceptSuggestionsAbsent
  ) {
    throw new Error("OVE-106 selected EU OJ/BG search case failed.");
  }
  if (
    searchProof.blockedRowsProof
      .reviewNeededAndRejectedOjRowsHaveNoProductLinks !== true ||
    searchProof.blockedRowsProof.blockedOjProjectionLeaks !== 0
  ) {
    throw new Error("OVE-106 blocked OJ row proof failed.");
  }
  const failedBlockedQuery =
    searchProof.blockedRowsProof.iasasOnlyRowsAbsentFromSearch.find(
      (result) =>
        !result.postgresForbiddenSuggestionAbsent ||
        !result.meilisearchForbiddenSuggestionAbsent ||
        !result.duplicateSameConceptSuggestionsAbsent,
    );
  if (failedBlockedQuery) {
    throw new Error(
      `OVE-106 blocked IASAS search proof failed for ${failedBlockedQuery.query}.`,
    );
  }
}
