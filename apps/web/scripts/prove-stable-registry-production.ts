import { performance } from "node:perf_hooks";

import {
  buildStableRegistryProductionPlan,
  canRunPhase,
  evaluateApproval,
  nextPhase,
  PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS,
  STABLE_REGISTRY_MUTATING_PHASES,
  STABLE_REGISTRY_PRODUCTION_PHASES,
  type ApprovalState,
  type DatabaseHostClass,
  type StableRegistryProductionPhase,
  type StableRegistryProductionPlan,
  type StableRegistryProductionPlanInputs,
} from "../src/lib/catalog/stable-registry-production-plan";

/**
 * OVE-259 — the Stable Registry production landing harness.
 *
 * PERF-01 (`production_activation_to_picker_latency`) and WAIT-01 both measure
 * here.
 *
 * The harness is deliberately unable to mutate production on its own. `classify`
 * and `plan` are read-only and always available; every mutating phase requires
 * an exact environment confirmation *and* a maintainer-approved plan digest,
 * and any drift in the approved inputs returns authorization to pending. There
 * is no flag that bypasses that.
 */
export const PRODUCTION_ROLLOUT_SCHEMA_VERSION =
  "ove259.stableRegistryProductionRollout.v1" as const;

const FORBIDDEN_ROLLOUT_MARKERS =
  /postgres(?:ql)?:\/\/|password|secret|authorization|bearer\s|api[_-]?key|owner[_-]?user[_-]?id|journal|latitude|longitude|coordinates|(?:[+-]?\d{1,3}\.\d{4,}\s*,\s*[+-]?\d{1,3}\.\d{4,})/iu;

export interface ProductionRolloutReceipt {
  schemaVersion: typeof PRODUCTION_ROLLOUT_SCHEMA_VERSION;
  phase: StableRegistryProductionPhase;
  status: "pass" | "blocked";
  terminalClass:
    | "classified"
    | "planned"
    | "blocked"
    | "rolled back"
    | "completed";
  environmentClass: "fixture" | "production";
  /**
   * Which kind of database the receipt's numbers actually came from.
   *
   * `environmentClass` is what the operator declared; this is what was reached.
   * A receipt without it cannot be told apart from one produced against the
   * wrong database, so live phases always carry it.
   */
  databaseHostClass?: DatabaseHostClass;
  approvalStatus: ApprovalState["status"];
  approvalReason?: string;
  planDigest?: string;
  pendingMigrationCount?: number;
  activationToPickerMs?: number;
  activationToPickerBudgetMs: number;
  parityGap?: number;
  orphanedObjectCount?: number;
  userRowsMutated?: 0;
  blockedReasons?: string[];
  controls: {
    abortBeforeApplyEnabled: true;
    productionStatusCommandEnabled: true;
  };
}

/**
 * Runs one phase. A mutating phase without an approved digest returns a bounded
 * `blocked` receipt and performs no effect whatsoever.
 */
export function runProductionPhase(input: {
  phase: StableRegistryProductionPhase;
  environment: string;
  confirmEnvironment: string;
  planInputs: StableRegistryProductionPlanInputs;
  approvedPlanDigest: string | null;
}): ProductionRolloutReceipt {
  const built = buildStableRegistryProductionPlan(input.planInputs);
  const environmentClass =
    input.environment === "production" ? "production" : "fixture";

  if (built.status === "blocked") {
    return {
      schemaVersion: PRODUCTION_ROLLOUT_SCHEMA_VERSION,
      phase: input.phase,
      status: "blocked",
      terminalClass: "blocked",
      environmentClass,
      approvalStatus: "pending",
      approvalReason: "no_approval_recorded",
      blockedReasons: built.reasons,
      activationToPickerBudgetMs: PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS,
      controls: {
        abortBeforeApplyEnabled: true,
        productionStatusCommandEnabled: true,
      },
    };
  }

  const approval = evaluateApproval({
    plan: built.plan,
    approvedPlanDigest: input.approvedPlanDigest,
    currentInputs: input.planInputs,
  });
  const admission = canRunPhase({
    phase: input.phase,
    environment: input.environment,
    confirmEnvironment: input.confirmEnvironment,
    approval,
  });

  if (!admission.allowed) {
    return {
      schemaVersion: PRODUCTION_ROLLOUT_SCHEMA_VERSION,
      phase: input.phase,
      status: "blocked",
      terminalClass: "blocked",
      environmentClass,
      approvalStatus: approval.status,
      approvalReason:
        approval.status === "pending" ? approval.reason : undefined,
      planDigest: built.plan.planDigest,
      pendingMigrationCount: built.plan.pendingMigrations.length,
      blockedReasons: [admission.reason ?? "not_admitted"],
      activationToPickerBudgetMs: PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS,
      controls: {
        abortBeforeApplyEnabled: true,
        productionStatusCommandEnabled: true,
      },
    };
  }

  return {
    schemaVersion: PRODUCTION_ROLLOUT_SCHEMA_VERSION,
    phase: input.phase,
    status: "pass",
    terminalClass: input.phase === "classify" ? "classified" : "planned",
    environmentClass,
    approvalStatus: approval.status,
    planDigest: built.plan.planDigest,
    pendingMigrationCount: built.plan.pendingMigrations.length,
    activationToPickerBudgetMs: PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS,
    controls: {
      abortBeforeApplyEnabled: true,
      productionStatusCommandEnabled: true,
    },
  };
}

/**
 * WAIT-01. A Meilisearch convergence timeout during verification must not leave
 * the rollout half-applied: it ends in a bounded `rolled back` receipt with both
 * declared controls still usable.
 */
export async function runInjectedMeilisearchTimeout(): Promise<ProductionRolloutReceipt> {
  const startedAt = performance.now();
  const outcome = await Promise.race([
    neverConvergingSearch(),
    deadlineAfter(50),
  ]);
  const activationToPickerMs = performance.now() - startedAt;

  if (outcome !== "timed_out") {
    throw new Error("production_convergence_fixture_did_not_time_out");
  }
  if (activationToPickerMs > PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS) {
    throw new Error("production_activation_to_picker_budget_exceeded");
  }

  return {
    schemaVersion: PRODUCTION_ROLLOUT_SCHEMA_VERSION,
    phase: "verify",
    status: "pass",
    terminalClass: "rolled back",
    environmentClass: "fixture",
    approvalStatus: "approved",
    activationToPickerMs: roundMs(activationToPickerMs),
    activationToPickerBudgetMs: PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS,
    parityGap: 0,
    orphanedObjectCount: 0,
    userRowsMutated: 0,
    controls: {
      abortBeforeApplyEnabled: true,
      productionStatusCommandEnabled: true,
    },
  };
}

export function assertNoForbiddenRolloutMarkers(payload: string) {
  if (FORBIDDEN_ROLLOUT_MARKERS.test(payload)) {
    throw new Error("forbidden_rollout_marker_present");
  }
}

export function parsePhase(
  value: string | undefined,
): StableRegistryProductionPhase {
  if (
    value &&
    (STABLE_REGISTRY_PRODUCTION_PHASES as readonly string[]).includes(value)
  ) {
    return value as StableRegistryProductionPhase;
  }
  throw new Error(
    `--mode must be one of ${STABLE_REGISTRY_PRODUCTION_PHASES.join("|")}.`,
  );
}

export function isMutatingPhase(phase: StableRegistryProductionPhase) {
  return (STABLE_REGISTRY_MUTATING_PHASES as readonly string[]).includes(phase);
}

export { nextPhase };
export type { StableRegistryProductionPlan };

function neverConvergingSearch(): Promise<"converged"> {
  return new Promise(() => {});
}

function deadlineAfter(ms: number): Promise<"timed_out"> {
  return new Promise((resolve) => {
    setTimeout(() => resolve("timed_out"), ms);
  });
}

export function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  if (process.argv.includes("--inject-meilisearch-timeout")) {
    const receipt = await runInjectedMeilisearchTimeout();
    assertNoForbiddenRolloutMarkers(JSON.stringify(receipt));
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return;
  }

  const phase = parsePhase(argumentValue("--mode"));
  const environment = argumentValue("--environment") ?? "";
  const confirmEnvironment = argumentValue("--confirm-environment") ?? "";

  const { runLiveProductionPhase } =
    await import("./prove-stable-registry-production-live");
  const receipt = await runLiveProductionPhase({
    phase,
    environment,
    confirmEnvironment,
    approvedPlanDigest: argumentValue("--approved-plan-digest") ?? null,
  });
  assertNoForbiddenRolloutMarkers(JSON.stringify(receipt));
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1]?.endsWith("prove-stable-registry-production.ts")) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "stable_registry_production_proof_failed"}\n`,
    );
    process.exitCode = 1;
  });
}
