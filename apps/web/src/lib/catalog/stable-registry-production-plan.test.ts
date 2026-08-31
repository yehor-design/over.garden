import { describe, expect, it } from "vitest";

import {
  buildStableRegistryProductionPlan,
  canRunPhase,
  databaseHostClass,
  environmentIdentityMatches,
  evaluateApproval,
  nextPhase,
  PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS,
  STABLE_REGISTRY_MIGRATION_SET,
  STABLE_REGISTRY_MUTATING_PHASES,
  type StableRegistryProductionPlanInputs,
} from "./stable-registry-production-plan";

function inputs(
  overrides: Partial<StableRegistryProductionPlanInputs> = {},
): StableRegistryProductionPlanInputs {
  return {
    environment: "production",
    deploymentSha: "a".repeat(40),
    appliedMigrations: ["0023_ove254_eppo_observed_capture.sql"],
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

describe("production plan construction", () => {
  it("lists only the missing migrations, in exact ascending order", () => {
    const result = buildStableRegistryProductionPlan(inputs());

    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.plan.pendingMigrations).toEqual([
      "0024_ove255_stable_registry_foundation.sql",
      "0025_ove256_stable_registry_public_reads.sql",
      "0026_ove257_stable_registry_product_projection.sql",
      "0027_ove328_stable_registry_extension_packs.sql",
      "0028_ove258_stable_registry_editions.sql",
    ]);
    expect(STABLE_REGISTRY_MIGRATION_SET).toHaveLength(6);
  });

  it("is deterministic and changes its digest when any input changes", () => {
    const first = buildStableRegistryProductionPlan(inputs());
    const replay = buildStableRegistryProductionPlan(inputs());
    const drifted = buildStableRegistryProductionPlan(
      inputs({ sourceInventoryTotal: 129_189 }),
    );

    if (
      first.status !== "planned" ||
      replay.status !== "planned" ||
      drifted.status !== "planned"
    ) {
      throw new Error("expected planned");
    }
    expect(replay.plan.planDigest).toBe(first.plan.planDigest);
    expect(drifted.plan.planDigest).not.toBe(first.plan.planDigest);
  });

  it("reports every closed gate at once rather than one per run", () => {
    const result = buildStableRegistryProductionPlan(
      inputs({
        deploymentSha: "  ",
        storageHeadroomClass: "insufficient",
        backupFreshnessClass: "stale",
        sourceInventoryTotal: 0,
        sourceInventoryDigest: "not-a-digest",
      }),
    );

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") return;
    expect(result.reasons).toEqual([
      "backup_not_fresh",
      "deployment_sha_missing",
      "insufficient_storage_headroom",
      "source_inventory_digest_invalid",
      "source_inventory_empty",
    ]);
  });

  it("refuses an unrecognised Stable Registry migration in production", () => {
    const result = buildStableRegistryProductionPlan(
      inputs({
        appliedMigrations: ["0029_someone_elses_registry_change.sql"],
      }),
    );

    expect(result).toMatchObject({
      status: "blocked",
      reasons: ["unknown_migration_present"],
    });
  });

  it("does not treat an unrelated later migration as registry drift", () => {
    // 0035+ belong to other programs and are legitimately applied.
    const result = buildStableRegistryProductionPlan(
      inputs({
        appliedMigrations: [
          "0023_ove254_eppo_observed_capture.sql",
          "0035_online_only_retirement.sql",
        ],
      }),
    );
    expect(result.status).toBe("planned");
  });
});

describe("maintainer approval", () => {
  const planned = buildStableRegistryProductionPlan(inputs());
  if (planned.status !== "planned") throw new Error("expected planned");
  const plan = planned.plan;

  it("is pending until a digest is recorded", () => {
    expect(evaluateApproval({ plan, approvedPlanDigest: null })).toEqual({
      status: "pending",
      reason: "no_approval_recorded",
    });
  });

  it("is pending when the recorded digest names a different plan", () => {
    expect(
      evaluateApproval({ plan, approvedPlanDigest: "c".repeat(64) }),
    ).toEqual({ status: "pending", reason: "approved_digest_mismatch" });
  });

  it("returns to pending when the inputs drift after approval", () => {
    expect(
      evaluateApproval({
        plan,
        approvedPlanDigest: plan.planDigest,
        currentInputs: inputs({ affectedObjectCount: 12 }),
      }),
    ).toEqual({ status: "pending", reason: "input_drift" });
  });

  it("approves only the exact plan whose inputs still hold", () => {
    expect(
      evaluateApproval({
        plan,
        approvedPlanDigest: plan.planDigest,
        currentInputs: inputs(),
      }),
    ).toEqual({ status: "approved" });
  });
});

describe("phase admission", () => {
  const pending = {
    status: "pending",
    reason: "no_approval_recorded",
  } as const;
  const approved = { status: "approved" } as const;

  it("lets a read-only phase run without any approval", () => {
    for (const phase of ["classify", "plan", "verify"] as const) {
      expect(
        canRunPhase({
          phase,
          environment: "production",
          confirmEnvironment: "production",
          approval: pending,
        }),
      ).toEqual({ allowed: true });
    }
  });

  it("refuses every mutating phase while approval is pending", () => {
    for (const phase of STABLE_REGISTRY_MUTATING_PHASES) {
      expect(
        canRunPhase({
          phase,
          environment: "production",
          confirmEnvironment: "production",
          approval: pending,
        }),
      ).toEqual({ allowed: false, reason: "maintainer_approval_pending" });
    }
  });

  it("refuses any phase whose environment confirmation does not match", () => {
    expect(
      canRunPhase({
        phase: "classify",
        environment: "production",
        confirmEnvironment: "staging",
        approval: approved,
      }),
    ).toEqual({ allowed: false, reason: "environment_confirmation_mismatch" });
  });

  it("admits a mutating phase only with an exact match and an approval", () => {
    expect(
      canRunPhase({
        phase: "apply",
        environment: "production",
        confirmEnvironment: "production",
        approval: approved,
      }),
    ).toEqual({ allowed: true });
  });
});

describe("phase ordering", () => {
  it("never lets a run skip a required predecessor", () => {
    expect(nextPhase("unclassified")).toBe("classify");
    expect(nextPhase("classified")).toBe("plan");
    expect(nextPhase("planned")).toBe("apply");
    expect(nextPhase("applying")).toBe("verify");
    expect(nextPhase("active")).toBe("rollback");
    expect(nextPhase("rollback_verified")).toBe("forward");
    expect(nextPhase("forward_verified")).toBe("cleanup");
    // A blocked or failed run has no next phase; it needs a new plan.
    expect(nextPhase("blocked")).toBeNull();
    expect(nextPhase("failed")).toBeNull();
    expect(nextPhase("completed")).toBeNull();
  });

  it("declares the activation-to-picker budget", () => {
    expect(PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS).toBe(5000);
  });
});


describe("environment identity", () => {
  it("classifies a connection by host rather than by what was declared", () => {
    expect(databaseHostClass("postgres://u:p@localhost:5432/db")).toBe(
      "loopback",
    );
    expect(databaseHostClass("postgres://u:p@127.0.0.1:5432/db")).toBe(
      "loopback",
    );
    expect(
      databaseHostClass("postgres://u:p@db.example-managed.com:25060/db"),
    ).toBe("remote");
  });

  it("treats an unreadable or absent connection as remote", () => {
    // "I cannot tell" must not resolve to "this is the safe local one",
    // because that is the reading that lets a real database be written to
    // under a fixture label.
    expect(databaseHostClass(undefined)).toBe("remote");
    expect(databaseHostClass("")).toBe("remote");
    expect(databaseHostClass("not a url")).toBe("remote");
  });

  it("refuses a production claim that reached a local database", () => {
    // The exact failure this guard exists for: `.env.local` outranks an
    // injected production value, so the command reads localhost and would
    // otherwise report `environmentClass: "production"` over local numbers.
    expect(
      environmentIdentityMatches({
        environment: "production",
        hostClass: "loopback",
      }),
    ).toEqual({
      matches: false,
      reason: "declared_production_reached_loopback_database",
    });
  });

  it("refuses a fixture claim that reached a real database", () => {
    expect(
      environmentIdentityMatches({
        environment: "fixture",
        hostClass: "remote",
      }),
    ).toEqual({
      matches: false,
      reason: "declared_non_production_reached_remote_database",
    });
  });

  it("admits each environment against the database it names", () => {
    expect(
      environmentIdentityMatches({
        environment: "production",
        hostClass: "remote",
      }),
    ).toEqual({ matches: true });
    expect(
      environmentIdentityMatches({
        environment: "fixture",
        hostClass: "loopback",
      }),
    ).toEqual({ matches: true });
  });
});
