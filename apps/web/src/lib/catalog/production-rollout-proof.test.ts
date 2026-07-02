import { describe, expect, it } from "vitest";

import type { CatalogEntityResolutionQaReport } from "@/server/catalog-source/entity-resolution-qa-repository";

import {
  assertNoForbiddenCatalogProductionRolloutEvidence,
  buildCatalogProductionRolloutEvidence,
  buildSafeBgOfficialVarietiesSummary,
  buildSafeEntityResolutionQaSummary,
  buildSafeEuOjImportSummary,
} from "./production-rollout-proof";
import {
  parseCatalogSeedRolloutArgs,
  validateCatalogSeedRolloutOptions,
} from "./seed-rollout-proof";

describe("catalog production rollout proof", () => {
  it("builds the OVE-90 gate from seed, EU OJ, BG smoke, QA, and search proof", () => {
    const evidence = buildCatalogProductionRolloutEvidence({
      options: validateCatalogSeedRolloutOptions(
        parseCatalogSeedRolloutArgs([
          "--environment",
          "production",
          "--confirm-environment",
          "production",
          "--base-url",
          "https://over.garden",
          "--allow-non-local-mutation",
        ]),
      ),
      codeState: {
        commitSha: "08db4d05a4403c2e37be84d6fd3f070aa2ff437d",
        branch: "main",
        workingTree: "clean",
      },
      seedRolloutEvidence: seedRolloutEvidence(),
      euOjImportOutput: euOjImportOutput(),
      bgOfficialVarietiesSmoke: bgSmokeOutput(),
      entityResolutionQa: entityResolutionQaReport(),
      searchProof: searchProof(),
      generatedAt: "2026-07-02T00:00:00.000Z",
    });

    expect(evidence).toMatchObject({
      schemaVersion: "ove90.fullCatalogProductionRolloutProof.v1",
      issue: "OVE-90",
      environment: {
        name: "production",
        baseUrl: "https://over.garden",
        databaseWriteScope: "explicit_non_local_environment",
        nonLocalMutationGate: "explicitly_confirmed",
      },
      proof: {
        availability: {
          sampleCoversEveryCompletedImportFamily: true,
          duplicateSameConceptSuggestionsAbsent: true,
          heldRejectedOrBlockedCandidatesAbsent: true,
        },
      },
      leakCheck: "passed",
    });
    expect(evidence.proof.seedRollout.seededFamilyCount).toBe(5);
    expect(evidence.proof.searchAndIndex.cases).toHaveLength(5);
    expect(JSON.stringify(evidence)).not.toMatch(
      /rawPayload|sourceRecord|sourceUrl|licenseUrl|database_url/i,
    );
  });

  it("fails closed when search/index proof does not match both paths", () => {
    expect(() =>
      buildCatalogProductionRolloutEvidence({
        options: validateCatalogSeedRolloutOptions(
          parseCatalogSeedRolloutArgs([
            "--environment",
            "production",
            "--confirm-environment",
            "production",
            "--base-url",
            "https://over.garden",
            "--allow-non-local-mutation",
          ]),
        ),
        codeState: {
          commitSha: "08db4d05a4403c2e37be84d6fd3f070aa2ff437d",
          branch: "main",
          workingTree: "clean",
        },
        seedRolloutEvidence: seedRolloutEvidence(),
        euOjImportOutput: euOjImportOutput(),
        bgOfficialVarietiesSmoke: bgSmokeOutput(),
        entityResolutionQa: entityResolutionQaReport(),
        searchProof: {
          ...searchProof(),
          cases: [
            {
              ...searchProof().cases[0],
              meilisearchMatched: false,
            },
          ],
        },
        generatedAt: "2026-07-02T00:00:00.000Z",
      }),
    ).toThrow("Search proof failed");
  });

  it("rejects EU OJ imports that let blocked parser rows reach product projection", () => {
    expect(() =>
      buildSafeEuOjImportSummary({
        ...euOjImportOutput(),
        blockedRecordProof: {
          projectionStatus: "projected",
        },
      }),
    ).toThrow("blocked parser row reached product projection");
  });

  it("rejects BG proof when it only covers the legacy Sadovo row", () => {
    expect(() =>
      buildSafeBgOfficialVarietiesSummary({
        ...bgSmokeOutput(),
        selectedBgOfficialVariety: {
          ...bgSmokeOutput().selectedBgOfficialVariety,
          beyondSadovoProof: false,
        },
      }),
    ).toThrow("did not go beyond Sadovo 1");
  });

  it("rejects entity-resolution QA with blocking clusters", () => {
    expect(() =>
      buildSafeEntityResolutionQaSummary({
        ...entityResolutionQaReport(),
        summary: {
          ...entityResolutionQaReport().summary,
          groups: [
            {
              kind: "likely_duplicate",
              label: "Likely duplicate",
              count: 1,
              nextAction: "Merge review",
            },
          ],
        },
      }),
    ).toThrow("blocking clusters");
  });

  it("fails closed when final evidence contains forbidden rollout markers", () => {
    expect(() =>
      assertNoForbiddenCatalogProductionRolloutEvidence({
        leakCheck: "passed",
        sourceUrl: "https://example.test/raw",
      }),
    ).toThrow("forbidden marker");
  });
});

function seedRolloutEvidence() {
  return {
    schemaVersion: "ove78.catalogSeedRolloutProof.v1",
    issue: "OVE-78",
    seedSet: {
      seeded: [
        seedFamily("ua-register-variety", "Ботсадівський", "plant_variety"),
        seedFamily("species-backbone", "Solanum lycopersicum L.", "species"),
        seedFamily("breed-seed", "Карпатська бджола", "breed"),
        seedFamily("bg-official-variety", "Садово 1", "plant_variety"),
        seedFamily("genebank-long-tail", "Red Cherry tomato", "plant_variety"),
      ],
    },
    proof: {
      idempotency: {
        stableProductIdentityForSeedCommands: true,
        duplicateSameConceptSuggestionsAbsent: true,
      },
      realAppSmoke: {
        baseUrl: "https://over.garden",
        leakCheck: "passed",
        cases: [
          {
            query: "Ботсадівський",
            suggestionCount: 1,
            selectedResultText: "Ботсадівський",
            canonicalName: "Ботсадівський",
            catalogKind: "plant_variety",
            objectKind: "plant",
            varietyState: "selected",
            duplicateSameConceptSuggestionsAbsent: true,
            readbackIdentityPreserved: true,
            readbackPageStatus: 200,
          },
        ],
        blockedAliasCases: [
          {
            query: "garden tomato",
            suggestionCount: 0,
            forbiddenDisplayNameAbsent: true,
            canonicalTargetAbsent: true,
            duplicateSameConceptSuggestionsAbsent: true,
          },
        ],
      },
    },
    leakCheck: "passed",
  };
}

function seedFamily(
  key: string,
  expectedCanonicalName: string,
  catalogKind: string,
) {
  return {
    key,
    packageScript: "catalog:sources:import",
    sourceSet: `${key} source set`,
    expectedCanonicalName,
    catalogItemId: "00000000-0000-4000-8000-000000090000",
    publicSlug: `${key}-slug`,
    canonicalName: expectedCanonicalName,
    catalogKind,
    source: `${key}_source`,
    aliasesProjected: 2,
    reindexQueued: true,
    stableProductIdentityOnRerun: true,
    sourceProofRecorded: true,
    leakCheck: "passed",
  };
}

function euOjImportOutput() {
  return {
    imported: {
      projectedConcepts: 10,
      sourceRecordsImported: 12,
      aliasesProjected: 20,
      sampleProjectedCanonicalName: "A sample BG OJ variety",
    },
    idempotencyProof: {
      rerunProjectedConcepts: 10,
      rerunSourceRecordsImported: 12,
      rerunSampleProjectedCatalogItemId: "00000000-0000-4000-8000-000000085000",
    },
    typeaheadProof: {
      projectedAcceptedRowReachable: true,
    },
    provenanceProof: {
      catalogItemId: "00000000-0000-4000-8000-000000085000",
      canonicalName: "A sample BG OJ variety",
      sourceName: "EU OJ Common Catalogue",
      sourceVersion: "2026-07-02",
      attributionRequired: true,
      projectionStatus: "projected",
      hasRequiredCaveats: true,
    },
    blockedRecordProof: {
      projectionStatus: "blocked",
    },
    leakCheck: "passed",
  };
}

function bgSmokeOutput() {
  return {
    issue: "OVE-85",
    baseUrl: "https://over.garden",
    bgOfficialJournalRowsProjected: 10,
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

function entityResolutionQaReport(): CatalogEntityResolutionQaReport {
  return {
    schemaVersion: "ove89.catalogEntityResolutionQa.v1",
    issue: "OVE-89",
    generatedAt: "2026-07-02T00:00:00.000Z",
    evidenceSafety: "linear_safe_redacted",
    summary: {
      clusterCount: 2,
      sourceBackedCatalogRowsReviewed: 24,
      aliasCollisionRowsReviewed: 2,
      sourceCandidateGroupsReviewed: 4,
      groups: [
        {
          kind: "likely_duplicate",
          label: "Likely duplicate",
          count: 0,
          nextAction: "Merge review",
        },
        {
          kind: "source_disagreement",
          label: "Source disagreement",
          count: 0,
          nextAction: "Review canonical source precedence",
        },
        {
          kind: "blocked_projection",
          label: "Blocked projection",
          count: 2,
          nextAction: "Reject or keep source-only",
        },
      ],
    },
    clusters: [],
    leakCheck: "passed",
  };
}

function searchProof() {
  return {
    indexName: "catalog_typeahead" as const,
    indexRefresh: {
      documentsIndexed: 24,
      taskWaited: true as const,
    },
    postgresFallback: "checked" as const,
    meilisearch: "checked" as const,
    cases: [
      searchCase("ua-state-register", "Ботсадівський", "plant_variety"),
      searchCase("species-backbone", "Solanum lycopersicum L.", "species"),
      searchCase("breed-seed", "Карпатська бджола", "breed"),
      searchCase("genebank-long-tail", "Red Cherry tomato", "plant_variety"),
      searchCase(
        "eu-oj-bg-official-varieties",
        "A sample BG OJ variety",
        "plant_variety",
      ),
    ],
    leakCheck: "passed" as const,
  };
}

function searchCase(
  key: string,
  expectedCanonicalName: string,
  expectedCatalogKind: "plant_variety" | "species" | "breed",
) {
  return {
    key,
    query: expectedCanonicalName,
    expectedCanonicalName,
    expectedCatalogKind,
    expectedSource: `${key}_source`,
    postgresMatched: true,
    meilisearchMatched: true,
    postgresSuggestionCount: 1,
    meilisearchSuggestionCount: 1,
    duplicateSameConceptSuggestionsAbsent: true,
  };
}
