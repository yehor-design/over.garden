import { describe, expect, it } from "vitest";

import {
  buildStableRegistryProductionPlan,
  PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS,
  STABLE_REGISTRY_MUTATING_PHASES,
  type StableRegistryProductionPlanInputs,
} from "../src/lib/catalog/stable-registry-production-plan";

import {
  assertNoForbiddenRolloutMarkers,
  isMutatingPhase,
  parsePhase,
  runInjectedMeilisearchTimeout,
  runProductionPhase,
} from "./prove-stable-registry-production";

function inputs(
  overrides: Partial<StableRegistryProductionPlanInputs> = {},
): StableRegistryProductionPlanInputs {
  return {
    environment: "production",
    deploymentSha: "a".repeat(40),
    appliedMigrations: [],
    sourceInventoryTotal: 129_188,
    sourceInventoryDigest: "b".repeat(64),
    releasePolicyVersion: "ove255.foundation.v1",
    storageHeadroomClass: "sufficient",
    backupFreshnessClass: "fresh",
    affectedObjectCount: 0,
    activeReleaseId: null,
    ...overrides,
  };
}

function approvedDigestFor(
  planInputs: StableRegistryProductionPlanInputs,
): string {
  const built = buildStableRegistryProductionPlan(planInputs);
  if (built.status !== "planned") throw new Error("expected planned");
  return built.plan.planDigest;
}

describe("read-only phases", () => {
  it("classifies and plans without any maintainer approval", () => {
    for (const phase of ["classify", "plan"] as const) {
      const receipt = runProductionPhase({
        phase,
        environment: "production",
        confirmEnvironment: "production",
        planInputs: inputs(),
        approvedPlanDigest: null,
      });

      expect(receipt.status).toBe("pass");
      expect(receipt.approvalStatus).toBe("pending");
      expect(receipt.pendingMigrationCount).toBe(6);
    }
  });

  it("reports every closed capacity gate instead of a bare failure", () => {
    const receipt = runProductionPhase({
      phase: "plan",
      environment: "production",
      confirmEnvironment: "production",
      planInputs: inputs({
        storageHeadroomClass: "insufficient",
        backupFreshnessClass: "stale",
      }),
      approvedPlanDigest: null,
    });

    expect(receipt.status).toBe("blocked");
    expect(receipt.blockedReasons).toEqual([
      "backup_not_fresh",
      "insufficient_storage_headroom",
    ]);
  });
});

describe("production mutation gate", () => {
  it("refuses every mutating phase while approval is pending", () => {
    for (const phase of STABLE_REGISTRY_MUTATING_PHASES) {
      const receipt = runProductionPhase({
        phase,
        environment: "production",
        confirmEnvironment: "production",
        planInputs: inputs(),
        approvedPlanDigest: null,
      });

      expect(receipt.status).toBe("blocked");
      expect(receipt.approvalStatus).toBe("pending");
      expect(receipt.blockedReasons).toEqual(["maintainer_approval_pending"]);
    }
  });

  it("refuses a phase whose environment confirmation does not match", () => {
    const planInputs = inputs();
    const receipt = runProductionPhase({
      phase: "classify",
      environment: "production",
      confirmEnvironment: "staging",
      planInputs,
      approvedPlanDigest: approvedDigestFor(planInputs),
    });

    expect(receipt.blockedReasons).toEqual([
      "environment_confirmation_mismatch",
    ]);
  });

  it("returns to pending when an approved plan's inputs drift", () => {
    const approvedInputs = inputs();
    const digest = approvedDigestFor(approvedInputs);
    const receipt = runProductionPhase({
      phase: "apply",
      environment: "production",
      confirmEnvironment: "production",
      // The corpus grew after approval: the approval no longer describes it.
      planInputs: inputs({ sourceInventoryTotal: 129_200 }),
      approvedPlanDigest: digest,
    });

    expect(receipt.status).toBe("blocked");
    expect(receipt.approvalStatus).toBe("pending");
    expect(receipt.approvalReason).toBe("approved_digest_mismatch");
  });

  it("admits a mutating phase only with an exact match and a live approval", () => {
    const planInputs = inputs();
    const receipt = runProductionPhase({
      phase: "apply",
      environment: "production",
      confirmEnvironment: "production",
      planInputs,
      approvedPlanDigest: approvedDigestFor(planInputs),
    });

    expect(receipt.status).toBe("pass");
    expect(receipt.approvalStatus).toBe("approved");
  });

  it("names every mutating phase so none can be added silently", () => {
    expect([...STABLE_REGISTRY_MUTATING_PHASES]).toEqual([
      "apply",
      "rollback",
      "forward",
      "cleanup",
    ]);
    expect(isMutatingPhase("apply")).toBe(true);
    expect(isMutatingPhase("classify")).toBe(false);
    expect(isMutatingPhase("plan")).toBe(false);
    expect(isMutatingPhase("verify")).toBe(false);
  });
});

describe("no-wedge and redaction", () => {
  it("ends a stalled search convergence in a bounded rolled back receipt", async () => {
    const receipt = await runInjectedMeilisearchTimeout();

    expect(receipt.terminalClass).toBe("rolled back");
    expect(receipt.parityGap).toBe(0);
    expect(receipt.orphanedObjectCount).toBe(0);
    expect(receipt.userRowsMutated).toBe(0);
    expect(receipt.activationToPickerMs).toBeLessThanOrEqual(
      PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS,
    );
    expect(receipt.controls).toEqual({
      abortBeforeApplyEnabled: true,
      productionStatusCommandEnabled: true,
    });
  });

  it("refuses a receipt carrying a credential, connection string, or user data", () => {
    for (const unsafe of [
      '{"url":"postgresql://user:pw@host/db"}',
      '{"header":"Authorization: Bearer abc"}',
      '{"note":"api_key"}',
      '{"note":"owner_user_id"}',
      '{"note":"49.8397, 24.0297"}',
    ]) {
      expect(() => assertNoForbiddenRolloutMarkers(unsafe)).toThrow(
        "forbidden_rollout_marker_present",
      );
    }
  });

  it("passes a real aggregate receipt through the redaction check", () => {
    const receipt = runProductionPhase({
      phase: "classify",
      environment: "production",
      confirmEnvironment: "production",
      planInputs: inputs(),
      approvedPlanDigest: null,
    });

    expect(() =>
      assertNoForbiddenRolloutMarkers(JSON.stringify(receipt)),
    ).not.toThrow();
  });

  it("accepts only a declared phase name", () => {
    expect(parsePhase("classify")).toBe("classify");
    expect(parsePhase("cleanup")).toBe("cleanup");
    expect(() => parsePhase("delete-everything")).toThrow(
      "--mode must be one of",
    );
    expect(() => parsePhase(undefined)).toThrow("--mode must be one of");
  });
});
