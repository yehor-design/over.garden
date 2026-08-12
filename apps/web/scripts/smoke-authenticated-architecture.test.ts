import { describe, expect, it, vi } from "vitest";

import {
  AUTHENTICATED_ARCHITECTURE_CHILD_IDS,
  AUTHENTICATED_ARCHITECTURE_MANIFEST,
  AUTHENTICATED_ARCHITECTURE_PREREQUISITE_IDS,
  AUTHENTICATED_ARCHITECTURE_SCHEMA_VERSION,
  EXPECTED_CHILD_RELATIONS,
  assertAuthenticatedArchitectureReceipt,
  assertRecursivelyRedactedArchitectureEvidence,
  buildAuthenticatedArchitectureManifestDigest,
  buildRelationDigest,
  validateAuthenticatedArchitectureEvidence,
  type AuthenticatedArchitectureEvidenceInputV1,
  type AuthenticatedArchitectureScenarioId,
} from "./smoke-authenticated-architecture-contract";
import {
  parseAuthenticatedArchitectureCliOptions,
  runAuthenticatedArchitectureHarness,
  type BrowserScenarioObservation,
} from "./smoke-authenticated-architecture";

const INTEGRATION_SHA = "a".repeat(40);
const PRODUCTION_OBSERVATION_DIGEST = "b".repeat(64);

function evidence(): AuthenticatedArchitectureEvidenceInputV1 {
  return {
    schemaVersion: "overgarden.authenticated-architecture-evidence-input.v1",
    childDescriptionDigests: Object.fromEntries(
      AUTHENTICATED_ARCHITECTURE_CHILD_IDS.map((issue, index) => [
        issue,
        (index + 1).toString(16).padStart(64, "0"),
      ]),
    ) as AuthenticatedArchitectureEvidenceInputV1["childDescriptionDigests"],
    childStates: Object.fromEntries(
      AUTHENTICATED_ARCHITECTURE_CHILD_IDS.map((issue) => [
        issue,
        issue === "OVE-292" ? "In Progress" : "Done",
      ]),
    ) as AuthenticatedArchitectureEvidenceInputV1["childStates"],
    childRelations: structuredClone(EXPECTED_CHILD_RELATIONS),
  };
}

function observation(
  scenarioId: AuthenticatedArchitectureScenarioId,
  epoch: number,
): BrowserScenarioObservation {
  return {
    scenarioId,
    scenarioEpoch: epoch,
    resultClass:
      scenarioId === "ordinary_recheck_remains_non_fencing"
        ? "degraded_recovered"
        : "passed",
    durationClass: "under_20s",
    evidenceDigest: (epoch + 32).toString(16).padStart(64, "0"),
    syntheticWritesTransmitted: 0,
    privateTreeRemovalDurationMs:
      scenarioId === "confirmed_invalidation_fences_synchronously" ||
      scenarioId === "immediate_exit_before_first_await"
        ? 4
        : null,
    publicNavigationResponsive: true,
    localeSwitcherResponsive: true,
    cleanupComplete: true,
  };
}

describe("OVE-292 authenticated architecture contract", () => {
  it("pins the exact twelve-scenario manifest and canonical digest", () => {
    expect(AUTHENTICATED_ARCHITECTURE_MANIFEST.map(({ id }) => id)).toEqual([
      "facebook_login_retired_google_link_preserved",
      "google_link_explicit_existing_credential_account",
      "ordinary_recheck_remains_non_fencing",
      "confirmed_invalidation_fences_synchronously",
      "owner_inspection_unavailable_retains",
      "vault_migration_target_readback_exact",
      "matching_owner_foreground_sync_only",
      "mutation_registry_receipt_continuity",
      "stale_document_mutation_rejected_with_zero_effect",
      "immediate_exit_before_first_await",
      "account_a_exit_zero_effect_on_account_b",
      "bfcache_persistent_marker_blocks_prior_content",
    ]);
    expect(AUTHENTICATED_ARCHITECTURE_MANIFEST).toHaveLength(12);
    expect(AUTHENTICATED_ARCHITECTURE_CHILD_IDS).toHaveLength(14);
    expect(AUTHENTICATED_ARCHITECTURE_PREREQUISITE_IDS).toHaveLength(13);

    const first = buildAuthenticatedArchitectureManifestDigest();
    const second = buildAuthenticatedArchitectureManifestDigest(
      [...AUTHENTICATED_ARCHITECTURE_MANIFEST].reverse(),
    );
    expect(first).toBe(
      "0077a025a9facbaee60e4f78f21c77cb49ffeee9c2db30dfff9e6c088c896bc0",
    );
    expect(second).toBe(first);
  });

  it("admits only the exact terminal child set and current acyclic relations", () => {
    const input = evidence();
    expect(validateAuthenticatedArchitectureEvidence(input)).toEqual({
      childDescriptionDigests: input.childDescriptionDigests,
      childStates: input.childStates,
      childRelations: EXPECTED_CHILD_RELATIONS,
      relationDigest: buildRelationDigest(EXPECTED_CHILD_RELATIONS),
    });
    expect(buildRelationDigest(EXPECTED_CHILD_RELATIONS)).toBe(
      "032e548766096d1be93d8b6c3f01dac163c68f94efe818468b405b065a8fbd61",
    );

    const missing = evidence();
    delete (missing.childDescriptionDigests as Record<string, string>)[
      "OVE-298"
    ];
    expect(() => validateAuthenticatedArchitectureEvidence(missing)).toThrow(
      "exactly fourteen child description digests",
    );

    const drifted = evidence();
    drifted.childRelations["OVE-298"] = {
      blocks: [],
      blockedBy: ["OVE-295"],
    };
    expect(() => validateAuthenticatedArchitectureEvidence(drifted)).toThrow(
      "OVE-298 relation drift",
    );

    const nonterminal = evidence();
    nonterminal.childStates["OVE-297"] = "In Progress";
    expect(() =>
      validateAuthenticatedArchitectureEvidence(nonterminal),
    ).toThrow("OVE-297 must be Done");
  });

  it("rejects forbidden evidence recursively instead of redacting after capture", () => {
    expect(() =>
      assertRecursivelyRedactedArchitectureEvidence({
        receipt: {
          resultClass: "passed",
          email: "private@example.com",
        },
      }),
    ).toThrow("forbidden evidence key");
    expect(() =>
      assertRecursivelyRedactedArchitectureEvidence({
        receipt: { evidenceClass: "token=private" },
      }),
    ).toThrow("forbidden evidence value");
    expect(() =>
      assertRecursivelyRedactedArchitectureEvidence({
        receipt: { evidenceDigest: "f".repeat(64), count: 0 },
      }),
    ).not.toThrow();
  });
});

describe("OVE-292 authenticated architecture harness", () => {
  it("emits one exact production receipt with truthful provenance and zero writes", async () => {
    const runScenario = vi.fn(async ({ scenarioId, scenarioEpoch }) =>
      observation(scenarioId, scenarioEpoch),
    );
    const observeProduction = vi.fn(async () => ({
      deploymentSha: INTEGRATION_SHA,
      observationDigest: PRODUCTION_OBSERVATION_DIGEST,
      googleSignInVisible: true as const,
      facebookAuthSurfaceCount: 0 as const,
      productMutationCount: 0 as const,
      sessionEffectCount: 0 as const,
    }));

    const receipt = await runAuthenticatedArchitectureHarness({
      environment: "production",
      confirmedEnvironment: "production",
      baseUrl: "https://over.garden",
      mode: "read_only_native_session",
      syntheticWritePolicy: "intercept_before_server",
      expectedSha: INTEGRATION_SHA,
      evidence: evidence(),
      runNonce: "bounded-test-run",
      runScenario,
      observeProduction,
    });

    expect(receipt.schemaVersion).toBe(
      AUTHENTICATED_ARCHITECTURE_SCHEMA_VERSION,
    );
    expect(receipt.scenarioCount).toBe(12);
    expect(receipt.scenarioResults).toHaveLength(12);
    expect(receipt.integrationSha).toBe(INTEGRATION_SHA);
    expect(receipt.deploymentClass).toBe("production_runtime_exact_sha");
    expect(receipt.cleanupClass).toBe(
      "ephemeral_browser_closed_no_session_created",
    );
    expect(receipt.effectCounts).toEqual({
      syntheticWritesTransmitted: 0,
      productMutations: 0,
      providerMutations: 0,
      sessionEffects: 0,
      analyticsEvents: 0,
    });
    expect(
      receipt.claimReceipts.some(
        ({ provenanceClass }) => provenanceClass === "production-observed",
      ),
    ).toBe(true);
    expect(
      receipt.claimReceipts.some(
        ({ provenanceClass }) => provenanceClass === "child-inherited",
      ),
    ).toBe(true);
    expect(
      receipt.claimReceipts.some(
        ({ provenanceClass }) => provenanceClass === "browser-simulated",
      ),
    ).toBe(true);
    expect(runScenario).toHaveBeenCalledTimes(12);
    expect(observeProduction).toHaveBeenCalledTimes(1);
    expect(() =>
      assertAuthenticatedArchitectureReceipt(receipt, {
        environment: "production",
      }),
    ).not.toThrow();
    expect(() =>
      assertRecursivelyRedactedArchitectureEvidence(receipt),
    ).not.toThrow();

    const reordered = structuredClone(receipt);
    [
      reordered.scenarioResults[0].scenarioId,
      reordered.scenarioResults[1].scenarioId,
    ] = [
      reordered.scenarioResults[1].scenarioId,
      reordered.scenarioResults[0].scenarioId,
    ];
    expect(() =>
      assertAuthenticatedArchitectureReceipt(reordered, {
        environment: "production",
      }),
    ).toThrow("scenario result order");

    const relationDrift = structuredClone(receipt);
    relationDrift.relationDigest = "c".repeat(64);
    expect(() =>
      assertAuthenticatedArchitectureReceipt(relationDrift, {
        environment: "production",
      }),
    ).toThrow("relation digest mismatch");

    const overclaimed = structuredClone(receipt);
    overclaimed.claimReceipts.push({
      claimId: "unexpected:production_runtime_and_auth_surface",
      scenarioId: "ordinary_recheck_remains_non_fencing",
      provenanceClass: "production-observed",
      evidenceDigest: PRODUCTION_OBSERVATION_DIGEST,
      resultClass: "satisfied",
    });
    expect(() =>
      assertAuthenticatedArchitectureReceipt(overclaimed, {
        environment: "production",
      }),
    ).toThrow("claim set drift");
  });

  it("fails closed on a transmitted write, slow synchronous fence, wait wedge, or SHA drift", async () => {
    const base = {
      environment: "production" as const,
      confirmedEnvironment: "production" as const,
      baseUrl: "https://over.garden",
      mode: "read_only_native_session" as const,
      syntheticWritePolicy: "intercept_before_server" as const,
      expectedSha: INTEGRATION_SHA,
      evidence: evidence(),
      runNonce: "bounded-failure-run",
      observeProduction: async () => ({
        deploymentSha: INTEGRATION_SHA,
        observationDigest: PRODUCTION_OBSERVATION_DIGEST,
        googleSignInVisible: true as const,
        facebookAuthSurfaceCount: 0 as const,
        productMutationCount: 0 as const,
        sessionEffectCount: 0 as const,
      }),
    };

    await expect(
      runAuthenticatedArchitectureHarness({
        ...base,
        runScenario: async ({ scenarioId, scenarioEpoch }) => ({
          ...observation(scenarioId, scenarioEpoch),
          syntheticWritesTransmitted:
            scenarioId === "stale_document_mutation_rejected_with_zero_effect"
              ? 1
              : 0,
        }),
      }),
    ).rejects.toThrow("synthetic write escaped");

    await expect(
      runAuthenticatedArchitectureHarness({
        ...base,
        runScenario: async ({ scenarioId, scenarioEpoch }) => ({
          ...observation(scenarioId, scenarioEpoch),
          privateTreeRemovalDurationMs:
            scenarioId === "confirmed_invalidation_fences_synchronously"
              ? 101
              : observation(scenarioId, scenarioEpoch)
                  .privateTreeRemovalDurationMs,
        }),
      }),
    ).rejects.toThrow("100 ms");

    await expect(
      runAuthenticatedArchitectureHarness({
        ...base,
        runScenario: async ({ scenarioId, scenarioEpoch }) => ({
          ...observation(scenarioId, scenarioEpoch),
          localeSwitcherResponsive:
            scenarioId === "ordinary_recheck_remains_non_fencing"
              ? false
              : true,
        }),
      }),
    ).rejects.toThrow("wait-safe controls");

    await expect(
      runAuthenticatedArchitectureHarness({
        ...base,
        runScenario: async ({ scenarioId, scenarioEpoch }) =>
          observation(scenarioId, scenarioEpoch),
        observeProduction: async () => ({
          deploymentSha: "c".repeat(40),
          observationDigest: PRODUCTION_OBSERVATION_DIGEST,
          googleSignInVisible: true,
          facebookAuthSurfaceCount: 0,
          productMutationCount: 0,
          sessionEffectCount: 0,
        }),
      }),
    ).rejects.toThrow("exact SHA");

    await expect(
      runAuthenticatedArchitectureHarness({
        ...base,
        runScenario: async ({ scenarioId, scenarioEpoch }) =>
          observation(scenarioId, scenarioEpoch + 1),
      }),
    ).rejects.toThrow("late or cross-epoch");
  });

  it("requires the closed CLI environment, mode, and intercept policy", () => {
    expect(
      parseAuthenticatedArchitectureCliOptions([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--base-url",
        "https://over.garden",
        "--expected-sha",
        INTEGRATION_SHA,
        "--mode",
        "read_only_native_session",
        "--synthetic-write-policy",
        "intercept_before_server",
        "--evidence-file",
        "/tmp/redacted-evidence.json",
      ]),
    ).toMatchObject({
      environment: "production",
      confirmedEnvironment: "production",
      mode: "read_only_native_session",
      expectedSha: INTEGRATION_SHA,
    });
    expect(() =>
      parseAuthenticatedArchitectureCliOptions([
        "--environment",
        "production",
        "--confirm-environment",
        "local",
        "--base-url",
        "https://over.garden",
        "--expected-sha",
        INTEGRATION_SHA,
        "--mode",
        "read_only_native_session",
        "--synthetic-write-policy",
        "allow",
        "--evidence-file",
        "/tmp/redacted-evidence.json",
      ]),
    ).toThrow();
  });
});
