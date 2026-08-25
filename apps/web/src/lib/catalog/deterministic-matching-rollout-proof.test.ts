import { describe, expect, it } from "vitest";

import {
  assertNoForbiddenDeterministicMatchingEvidence,
  buildLocalDeterministicMatchingRolloutEvidence,
  buildNonLocalDeterministicMatchingRolloutEvidence,
  parseDeterministicMatchingRolloutArgs,
  validateDeterministicMatchingRolloutOptions,
} from "./deterministic-matching-rollout-proof";

const codeState = {
  commitSha: "a".repeat(40),
  branch: "main",
  workingTree: "clean" as const,
};

const localOptions = {
  environment: "local" as const,
  confirmEnvironment: "local" as const,
  baseUrl: "http://localhost:3000",
};

function localProofInput() {
  return {
    options: localOptions,
    codeState,
    canonicalRefresh: {
      ok: true,
      issue: "OVE-159",
      unchangedEvidenceKeepsRejection: true,
      timestampOnlyTouchKeepsRejection: true,
      objectCountOnlyKeepsRejection: true,
      materialEvidenceChangeReopensSuggestion: true,
      previousDecisionClearedOnReopen: true,
      productionDataTouched: false,
    },
    canonicalMatch: {
      ok: true,
      issue: "OVE-159",
      rejectionIsSuggestionOnly: true,
      staleSuggestionCannotApprove: true,
      approvalIsAtomic: true,
      journalHistoryStable: true,
      auditMetadataRecorded: true,
      completedReindexJobRequeuedOnlyForApproval: true,
      concurrentObjectCreationSerialized: true,
      approvedCanonicalServeClass: "exact",
      legacyWorkerCompatibilityPreservesSuggestionOnly: true,
      productionDataTouched: false,
    },
    aliasReview: {
      ok: true,
      issue: "OVE-160",
      workerContractExecuted: true,
      generatedVariantsReviewGated: true,
      collisionApprovalBlocked: true,
      rejectionLeavesTypeaheadUntouched: true,
      approvalProjectsAliasAtomically: true,
      approvedAliasFoundThroughTypeahead: true,
      approvedAliasServeClass: "generated",
      staleSourceApprovalPreservesCanonicalState: true,
      replayPreservesAcceptedAndRejectedDecisions: true,
      productionDataTouched: false,
    },
    gardenerReadback: {
      ok: true,
      schemaVersion: "ove161.catalogGardenerReadbackSmoke.v1",
      issue: "OVE-161",
      gardenSurface: "operational_home",
      searchCases: [
        { kind: "typo", suggestionCount: 1 },
        { kind: "transliteration", suggestionCount: 1 },
        { kind: "synonym", suggestionCount: 1 },
        { kind: "cross_locale", suggestionCount: 1 },
      ],
      postgresFallbackAliases: ["transliteration", "synonym", "cross_locale"],
      firstEntryCanonicalReadback: true,
      existingObjectCanonicalReadback: true,
      unknownFallback: true,
      addMissingFallback: true,
      duplicateProvisionalAliasAbsent: true,
      unsafeMeiliMetadataAbsent: true,
      journalHistoryPreserved: true,
      leakCheck: "passed",
      productionDataTouched: false,
    },
    fuzzyDuplicate: {
      schemaVersion: "ove162.catalogFuzzyDuplicateQaSmoke.v1",
      mode: "prove",
      fixturePair: "Red Cherry / Red Chery",
      suggestionCount: 1,
      advisoryOnly: true,
      leakCheck: "passed",
    },
    workerRecovery: {
      status: "passed" as const,
      jobKinds: [
        "catalog_match_suggestions_refresh",
        "catalog_alias_suggestions_refresh",
        "catalog_fuzzy_duplicate_qa_refresh",
        "catalog_typeahead_reindex",
      ],
      staleClaimRecovery: true,
      boundedLeaseCoverage: true,
      rerunRequestedCoverage: true,
      idempotentHandlerCoverage: true,
    },
    generatedAt: "2026-07-16T08:00:00.000Z",
  };
}

describe("deterministic matching rollout options", () => {
  it("parses a confirmed local proof target", () => {
    expect(
      validateDeterministicMatchingRolloutOptions(
        parseDeterministicMatchingRolloutArgs([
          "--environment",
          "local",
          "--confirm-environment",
          "local",
          "--base-url",
          "http://127.0.0.1:3000/",
        ]),
      ),
    ).toEqual({
      environment: "local",
      confirmEnvironment: "local",
      baseUrl: "http://127.0.0.1:3000",
    });
  });

  it("rejects target mismatch and unsafe origins", () => {
    expect(() =>
      validateDeterministicMatchingRolloutOptions({
        environment: "local",
        confirmEnvironment: "production",
        baseUrl: "http://localhost:3000",
      }),
    ).toThrow(/exactly match/);
    expect(() =>
      validateDeterministicMatchingRolloutOptions({
        environment: "local",
        confirmEnvironment: "local",
        baseUrl: "https://over.garden",
      }),
    ).toThrow(/loopback/);
    expect(() =>
      validateDeterministicMatchingRolloutOptions({
        environment: "production",
        confirmEnvironment: "production",
        baseUrl: "http://over.garden",
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      validateDeterministicMatchingRolloutOptions({
        environment: "production",
        confirmEnvironment: "production",
        baseUrl: "https://over.garden/garden",
      }),
    ).toThrow(/origin root/);
  });
});

describe("local deterministic matching rollout evidence", () => {
  it("accepts the complete operator and gardener behavior chain", () => {
    const evidence =
      buildLocalDeterministicMatchingRolloutEvidence(localProofInput());

    expect(evidence).toMatchObject({
      schemaVersion: "ove163.deterministicMatchingRolloutProof.v1",
      issue: "OVE-163",
      environment: {
        name: "local",
        mutationScope: "disposable_local_fixtures",
      },
      proof: {
        canonicalMatch: {
          suggestionGeneration: "passed",
          approval: "passed",
          rejection: "passed",
          staleEvidence: "passed",
          servedClass: "exact",
          legacyWorkerCompatibility: "suggestion_only",
        },
        aliases: {
          approval: "passed",
          rejection: "passed",
          collisionHold: "passed",
          servedClass: "generated",
          staleSourceApproval: "canonical_state_preserved",
        },
        gardenerReadback: {
          authenticatedSurface: "operational_home",
          typeahead: "passed",
          firstEntry: "passed",
          existingObject: "passed",
        },
        fuzzyDuplicates: { advisoryOnly: true },
        workerRecovery: { status: "passed" },
      },
      leakCheck: "passed",
    });
  });

  it("fails closed when one behavior or leak check is missing", () => {
    const missingApproval = localProofInput();
    missingApproval.canonicalMatch.approvalIsAtomic = false;
    expect(() =>
      buildLocalDeterministicMatchingRolloutEvidence(missingApproval),
    ).toThrow(/canonical match approval/i);

    const unsafeTypeahead = localProofInput();
    unsafeTypeahead.gardenerReadback.leakCheck = "failed";
    expect(() =>
      buildLocalDeterministicMatchingRolloutEvidence(unsafeTypeahead),
    ).toThrow(/leak check/i);

    const guestSurface = localProofInput();
    guestSurface.gardenerReadback.gardenSurface = "guest";
    expect(() =>
      buildLocalDeterministicMatchingRolloutEvidence(guestSurface),
    ).toThrow(/authenticated gardener surface/i);
  });
});

describe("read-only non-local rollout evidence", () => {
  it("requires deployed schema, runtime, safe QA, and search boundaries without mutations", () => {
    const evidence = buildNonLocalDeterministicMatchingRolloutEvidence({
      options: {
        environment: "production",
        confirmEnvironment: "production",
        baseUrl: "https://over.garden",
      },
      codeState,
      runtime: { healthStatus: 200, canonicalOrigin: true },
      schema: {
        tablesPresent: {
          matchSuggestions: true,
          aliasProjections: true,
          fuzzyDuplicateSuggestions: true,
          jobQueue: true,
        },
        payloadConstraintsPresent: {
          matchRefresh: true,
          aliasRefresh: true,
          fuzzyRefresh: true,
        },
      },
      search: {
        reachable: true,
        safeDocumentContract: true,
        canonicalResultVisible: true,
      },
      entityResolutionQa: {
        schemaVersion: "ove162.catalogEntityResolutionQa.v2",
        leakCheck: "passed",
        fullPersistedFuzzyPairCount: 2230,
        reviewedFuzzyPairCount: 240,
        renderedFuzzyClusterCount: 24,
      },
      generatedAt: "2026-07-16T08:05:00.000Z",
    });

    expect(evidence).toMatchObject({
      environment: {
        name: "production",
        mutationScope: "read_only",
      },
      proof: {
        runtime: "passed",
        schema: "passed",
        search: "passed",
        entityResolutionQa: "passed",
      },
      productionDataTouched: false,
      leakCheck: "passed",
    });
  });

  it("rejects an incomplete production schema proof", () => {
    expect(() =>
      buildNonLocalDeterministicMatchingRolloutEvidence({
        options: {
          environment: "production",
          confirmEnvironment: "production",
          baseUrl: "https://over.garden",
        },
        codeState,
        runtime: { healthStatus: 200, canonicalOrigin: true },
        schema: {
          tablesPresent: {
            matchSuggestions: true,
            aliasProjections: false,
            fuzzyDuplicateSuggestions: true,
            jobQueue: true,
          },
          payloadConstraintsPresent: {
            matchRefresh: true,
            aliasRefresh: true,
            fuzzyRefresh: true,
          },
        },
        search: {
          reachable: true,
          safeDocumentContract: true,
          canonicalResultVisible: true,
        },
        entityResolutionQa: {
          schemaVersion: "ove162.catalogEntityResolutionQa.v2",
          leakCheck: "passed",
          fullPersistedFuzzyPairCount: 0,
          reviewedFuzzyPairCount: 0,
          renderedFuzzyClusterCount: 0,
        },
        generatedAt: "2026-07-16T08:05:00.000Z",
      }),
    ).toThrow(/production schema/i);
  });
});

describe("rollout evidence privacy boundary", () => {
  it("rejects forbidden fields recursively", () => {
    expect(() =>
      assertNoForbiddenDeterministicMatchingEvidence({
        safe: { nested: { email: "private@example.test" } },
      }),
    ).toThrow(/forbidden/i);
  });
});
