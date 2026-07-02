import { describe, expect, it } from "vitest";

import {
  buildEuOjProductionUxSearchEvidence,
  type EuOjProductionUxSearchProof,
} from "./eu-oj-production-ux-search-proof";
import {
  parseCatalogSeedRolloutArgs,
  validateCatalogSeedRolloutOptions,
} from "./seed-rollout-proof";

describe("OVE-106 EU OJ production UX/search proof", () => {
  it("builds redacted production evidence from garden smoke plus Postgres and Meili search proof", () => {
    const evidence = buildEuOjProductionUxSearchEvidence({
      options: productionOptions(),
      codeState: {
        commitSha: "358bce468e1433904949cff58f8277b849348491",
        branch: "main",
        workingTree: "clean",
      },
      bgOfficialVarietiesSmoke: bgSmokeOutput(),
      searchProof: searchProof(),
      generatedAt: "2026-07-02T00:00:00.000Z",
    });

    expect(evidence).toMatchObject({
      schemaVersion: "ove106.euOjProductionUxSearchProof.v1",
      issue: "OVE-106",
      environment: {
        name: "production",
        baseUrl: "https://over.garden",
        databaseWriteScope: "explicit_non_local_environment",
        nonLocalMutationGate: "explicitly_confirmed",
      },
      proof: {
        availability: {
          euOjBgProductionFamilyCleared: true,
          duplicateSameConceptSuggestionsAbsent: true,
          heldRejectedOrBlockedCandidatesAbsent: true,
          publicSafeMeiliHitContract: true,
        },
      },
      leakCheck: "passed",
    });
    expect(evidence.proof.productionGardenSmoke.selectedCanonicalName).toBe(
      "A sample BG OJ variety",
    );
    expect(evidence.proof.searchAndIndex.selectedCase).toMatchObject({
      postgresMatched: true,
      meilisearchMatched: true,
      duplicateSameConceptSuggestionsAbsent: true,
    });
    expect(JSON.stringify(evidence)).not.toMatch(
      /rawPayload|sourceRecord|sourceUrl|licenseUrl|database_url|cookie|secret/i,
    );
  });

  it("fails closed when Meilisearch does not expose the landed EU OJ/BG row", () => {
    expect(() =>
      buildEuOjProductionUxSearchEvidence({
        options: productionOptions(),
        codeState: {
          commitSha: "358bce468e1433904949cff58f8277b849348491",
          branch: "main",
          workingTree: "clean",
        },
        bgOfficialVarietiesSmoke: bgSmokeOutput(),
        searchProof: {
          ...searchProof(),
          selectedCase: {
            ...searchProof().selectedCase,
            meilisearchMatched: false,
          },
        },
        generatedAt: "2026-07-02T00:00:00.000Z",
      }),
    ).toThrow("selected EU OJ/BG search case failed");
  });

  it("fails closed when blocked OJ rows have product links", () => {
    expect(() =>
      buildEuOjProductionUxSearchEvidence({
        options: productionOptions(),
        codeState: {
          commitSha: "358bce468e1433904949cff58f8277b849348491",
          branch: "main",
          workingTree: "clean",
        },
        bgOfficialVarietiesSmoke: bgSmokeOutput(),
        searchProof: {
          ...searchProof(),
          blockedRowsProof: {
            ...searchProof().blockedRowsProof,
            blockedOjProjectionLeaks: 1,
          },
        },
        generatedAt: "2026-07-02T00:00:00.000Z",
      }),
    ).toThrow("blocked OJ row proof failed");
  });
});

function productionOptions() {
  return validateCatalogSeedRolloutOptions(
    parseCatalogSeedRolloutArgs([
      "--environment",
      "production",
      "--confirm-environment",
      "production",
      "--base-url",
      "https://over.garden",
      "--allow-non-local-mutation",
    ]),
  );
}

function bgSmokeOutput() {
  return {
    issue: "OVE-85",
    baseUrl: "https://over.garden",
    bgOfficialJournalRowsProjected: 721,
    selectedBgOfficialVariety: {
      query: "A sample BG OJ variety",
      displayName: "A sample BG OJ variety",
      canonicalName: "A sample BG OJ variety",
      catalogKind: "plant_variety",
      source: "eu_oj_eur_lex_common_catalogue",
      bulgariaRelevantRow: true,
      beyondSadovoProof: true,
      duplicateSameConceptSuggestionsAbsent: true,
      readbackStatus: 200,
      sourceAttributionShown: true,
      legalValueCaveatShown: true,
    },
    sadovoStabilityProof: {
      query: "Садово 1",
      canonicalName: "Садово 1",
      catalogKind: "plant_variety",
      source: "eu_common_catalogue_bg",
      stillSelectableAfterBgFullImport: true,
      duplicateSameConceptSuggestionsAbsent: true,
    },
    blockedRowsProof: {
      reviewNeededAndRejectedOjRowsHaveNoProductLinks: true,
      blockedOjProjectionLeaks: 0,
      iasasOnlyRowsAbsentFromTypeahead: [
        {
          query: "Куртовска капия",
          iasasOnlyProjectionAbsent: true,
        },
      ],
    },
    productionRolloutClaim: false,
    leakCheck: "passed",
  };
}

function searchProof(): EuOjProductionUxSearchProof {
  return {
    indexName: "catalog_typeahead",
    derivedIndexRefresh: {
      mode: "direct_safe_catalog_rebuild",
      documentsIndexed: 748,
      taskWaited: true,
      meilisearchMatchedAfterRefresh: true,
    },
    postgresFallback: "checked",
    meilisearch: "checked",
    selectedCase: {
      key: "eu-oj-bg-official-varieties",
      query: "A sample BG OJ variety",
      expectedCanonicalName: "A sample BG OJ variety",
      expectedCatalogKind: "plant_variety",
      expectedSource: "eu_oj_eur_lex_common_catalogue",
      postgresMatched: true,
      meilisearchMatched: true,
      postgresSuggestionCount: 1,
      meilisearchSuggestionCount: 1,
      duplicateSameConceptSuggestionsAbsent: true,
    },
    blockedRowsProof: {
      reviewNeededAndRejectedOjRowsHaveNoProductLinks: true,
      blockedOjProjectionLeaks: 0,
      iasasOnlyRowsAbsentFromSearch: [
        {
          query: "Куртовска капия",
          postgresForbiddenSuggestionAbsent: true,
          meilisearchForbiddenSuggestionAbsent: true,
          duplicateSameConceptSuggestionsAbsent: true,
        },
      ],
    },
    publicSafeMeiliHitContract: true,
    leakCheck: "passed",
  };
}
