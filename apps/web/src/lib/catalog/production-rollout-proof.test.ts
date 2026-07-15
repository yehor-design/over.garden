import { describe, expect, it } from "vitest";

import type { CatalogEntityResolutionQaReport } from "@/server/catalog-source/entity-resolution-qa-repository";

import {
  assertNoForbiddenCatalogProductionRolloutEvidence,
  buildCatalogProductionRolloutEvidence,
  buildSafeBgOfficialVarietiesSummary,
  buildSafeEntityResolutionQaSummary,
  buildSafeSourceAvailabilitySummary,
} from "./production-rollout-proof";
import {
  parseCatalogSeedRolloutArgs,
  validateCatalogSeedRolloutOptions,
} from "./seed-rollout-proof";

describe("catalog production rollout proof", () => {
  it("builds the OVE-90 gate from production source availability, app smoke, QA, and search proof", () => {
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
      sourceAvailability: sourceAvailabilityProof(),
      realAppSmoke: realAppSmokeOutput(),
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
    expect(evidence.proof.sourceAvailability.completedFamilyCount).toBe(6);
    expect(evidence.proof.realAppSmoke.caseCount).toBe(23);
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
        sourceAvailability: sourceAvailabilityProof(),
        realAppSmoke: realAppSmokeOutput(),
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

  it("rejects source availability proofs that link blocked source rows", () => {
    expect(() =>
      buildSafeSourceAvailabilitySummary({
        ...sourceAvailabilityProof(),
        blockedProjectionLinkLeaks: 1,
      }),
    ).toThrow("Blocked source projections have product links");
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

function sourceAvailabilityProof() {
  return {
    schemaVersion: "ove90.productionSourceAvailability.v1" as const,
    completedFamilies: [
      sourceFamily(
        "ua-state-register",
        "OVE-81 UA State Register official variety wave",
        "Ботсадівський",
        "plant_variety",
        "ua_state_register",
      ),
      sourceFamily(
        "species-backbone",
        "OVE-58/82/83 species backbone and alias expansion",
        "Solanum lycopersicum L.",
        "species",
        "species_backbone",
      ),
      sourceFamily(
        "breed-seed",
        "OVE-60/86 approved bee and VBO breed seed",
        "Карпатська бджола",
        "breed",
        "ua_official_bee_breed",
      ),
      sourceFamily(
        "bg-official-variety-proof-subset",
        "OVE-61 BG official variety proof subset",
        "Садово 1",
        "plant_variety",
        "eu_common_catalogue_bg",
      ),
      sourceFamily(
        "eu-oj-bg-official-varieties",
        "OVE-85 EU OJ Bulgaria official varieties",
        null,
        "plant_variety",
        "eu_oj_eur_lex_common_catalogue",
        "A sample BG OJ variety",
        10,
      ),
      sourceFamily(
        "genebank-long-tail",
        "OVE-88 GRIN/NPGS promoted long-tail candidates",
        "Red Cherry tomato",
        "plant_variety",
        "grin_genebank_candidate",
      ),
    ],
    blockedProjectionLinkLeaks: 0,
    leakCheck: "passed" as const,
  };
}

function sourceFamily(
  key: string,
  sourceSet: string,
  expectedCanonicalName: string | null,
  catalogKind: "plant_variety" | "species" | "breed",
  source: string,
  canonicalName = expectedCanonicalName ?? "A sample source-backed item",
  productVisibleRowsForSource = 1,
) {
  return {
    key,
    sourceSet,
    expectedCanonicalName,
    expectedCatalogKind: catalogKind,
    expectedSource: source,
    catalogItemId: "00000000-0000-4000-8000-000000090000",
    publicSlug: `${key}-slug`,
    canonicalName,
    catalogKind,
    source,
    aliasesProjected: 2,
    productVisibleRowsForSource,
    sourceProofRecorded: true,
    duplicateProductIdentitiesAbsent: true,
    productVisible: true,
    leakCheck: "passed" as const,
  };
}

function realAppSmokeOutput() {
  return {
    baseUrl: "https://over.garden",
    cases: Array.from({ length: 23 }, (_, index) => ({
      query: `query-${index}`,
      suggestionCount: 1,
      selectedResultText: `Display ${index}`,
      canonicalName: `Canonical ${index}`,
      catalogKind: "plant_variety" as const,
      objectKind: "plant" as const,
      varietyState: "selected",
      duplicateSameConceptSuggestionsAbsent: true,
      readbackIdentityPreserved: true,
      readbackPageStatus: 200,
    })),
    blockedAliasCases: [
      {
        query: "garden tomato",
        suggestionCount: 0,
        forbiddenDisplayNameAbsent: true,
        canonicalTargetAbsent: true,
        duplicateSameConceptSuggestionsAbsent: true,
      },
    ],
    leakCheck: "passed" as const,
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
    schemaVersion: "ove162.catalogEntityResolutionQa.v2",
    issue: "OVE-162",
    generatedAt: "2026-07-02T00:00:00.000Z",
    evidenceSafety: "linear_safe_redacted",
    summary: {
      clusterCount: 2,
      sourceBackedCatalogRowsReviewed: 24,
      aliasCollisionRowsReviewed: 2,
      sourceCandidateGroupsReviewed: 4,
      fuzzyDuplicatePairCount: 0,
      fuzzyDuplicateRowsReviewed: 0,
      groups: [
        {
          kind: "fuzzy_duplicate",
          label: "Fuzzy duplicate",
          count: 0,
          nextAction: "Merge review or hold",
        },
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
