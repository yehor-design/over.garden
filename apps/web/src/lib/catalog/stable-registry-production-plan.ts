import { createHash } from "node:crypto";

/**
 * OVE-259 — the immutable Stable Registry production plan.
 *
 * This module is pure and browser-safe on purpose: the plan must be derivable,
 * diffable, and digestible without a database connection, so a maintainer can
 * approve one exact digest and the harness can later prove the inputs have not
 * drifted from what was approved.
 *
 * Approving a plan authorizes exactly one set of inputs. Any drift returns the
 * authorization to pending rather than reusing the approval.
 */
export const STABLE_REGISTRY_PRODUCTION_PLAN_SCHEMA_VERSION =
  "ove259.stableRegistryProductionPlan.v1" as const;

export const STABLE_REGISTRY_PRODUCTION_PHASES = [
  "classify",
  "plan",
  "apply",
  "verify",
  "rollback",
  "forward",
  "cleanup",
] as const;

export type StableRegistryProductionPhase =
  (typeof STABLE_REGISTRY_PRODUCTION_PHASES)[number];

/** The only phases that may change production state. */
export const STABLE_REGISTRY_MUTATING_PHASES = [
  "apply",
  "rollback",
  "forward",
  "cleanup",
] as const;

export const STABLE_REGISTRY_PRODUCTION_STATES = [
  "unclassified",
  "classified",
  "planned",
  "approved",
  "applying",
  "verifying",
  "active",
  "rollback_verified",
  "forward_verified",
  "cleaned",
  "completed",
  "blocked",
  "failed",
  "rolled_back",
] as const;

export type StableRegistryProductionState =
  (typeof STABLE_REGISTRY_PRODUCTION_STATES)[number];

/**
 * Migrations 0023-0028, in the exact ascending order they must be applied.
 * `docs/MIGRATION_ALLOCATION.md` is the reservation authority; this is the
 * apply-order authority for one production landing.
 */
export const STABLE_REGISTRY_MIGRATION_SET = [
  "0023_ove254_eppo_observed_capture.sql",
  "0024_ove255_stable_registry_foundation.sql",
  "0025_ove256_stable_registry_public_reads.sql",
  "0026_ove257_stable_registry_product_projection.sql",
  "0027_ove328_stable_registry_extension_packs.sql",
  "0028_ove258_stable_registry_editions.sql",
] as const;

export const STABLE_REGISTRY_PRODUCTION_FLAGS = [
  "STABLE_REGISTRY_RELEASE_CENTER",
  "STABLE_REGISTRY_PUBLIC_DISCOVERY",
  "STABLE_REGISTRY_PRODUCT_SELECTION",
  "STABLE_REGISTRY_EXTENSION_PACKS",
  "STABLE_REGISTRY_EDITIONS",
] as const;

/** PERF-01: activation must be visible to the canonical picker within this. */
export const PRODUCTION_ACTIVATION_TO_PICKER_BUDGET_MS = 5000;

export type CapacityClass = "sufficient" | "marginal" | "insufficient";
export type BackupClass = "fresh" | "stale" | "unknown";

export interface StableRegistryProductionPlanInputs {
  environment: "production";
  /** Exact deployment the plan was generated against. */
  deploymentSha: string;
  /** Migrations already applied in production, in any order. */
  appliedMigrations: readonly string[];
  sourceInventoryTotal: number;
  sourceInventoryDigest: string;
  releasePolicyVersion: string;
  storageHeadroomClass: CapacityClass;
  backupFreshnessClass: BackupClass;
  /** Existing garden objects that reference an identity this plan touches. */
  affectedObjectCount: number;
  activeReleaseId: string | null;
}

export interface StableRegistryProductionPlan {
  schemaVersion: typeof STABLE_REGISTRY_PRODUCTION_PLAN_SCHEMA_VERSION;
  environment: "production";
  deploymentSha: string;
  /** Only the migrations still missing, in exact ascending order. */
  pendingMigrations: string[];
  migrationSetDigest: string;
  sourceInventoryTotal: number;
  sourceInventoryDigest: string;
  releasePolicyVersion: string;
  storageHeadroomClass: CapacityClass;
  backupFreshnessClass: BackupClass;
  affectedObjectCount: number;
  activeReleaseId: string | null;
  /** The digest a maintainer approves. Changing any input changes it. */
  planDigest: string;
}

export type PlanBlockReason =
  | "unknown_migration_present"
  | "insufficient_storage_headroom"
  | "backup_not_fresh"
  | "deployment_sha_missing"
  | "source_inventory_empty"
  | "source_inventory_digest_invalid";

export type BuildPlanResult =
  | { status: "planned"; plan: StableRegistryProductionPlan }
  | { status: "blocked"; reasons: PlanBlockReason[] };

/**
 * Builds one zero-write plan, or refuses with every reason at once.
 *
 * Refusing with the complete reason list matters: a maintainer should see every
 * gate that is closed in one read rather than fixing them one failed run at a
 * time.
 */
export function buildStableRegistryProductionPlan(
  inputs: StableRegistryProductionPlanInputs,
): BuildPlanResult {
  const reasons: PlanBlockReason[] = [];

  const known = new Set<string>(STABLE_REGISTRY_MIGRATION_SET);
  const unknownApplied = inputs.appliedMigrations.filter(
    (migration) => migration.startsWith("002") && !known.has(migration),
  );
  if (unknownApplied.length > 0) {
    // An unrecognised Stable Registry migration means production and this
    // program disagree about schema history; refuse rather than reconcile.
    reasons.push("unknown_migration_present");
  }
  if (!inputs.deploymentSha.trim()) reasons.push("deployment_sha_missing");
  if (inputs.storageHeadroomClass === "insufficient") {
    reasons.push("insufficient_storage_headroom");
  }
  if (inputs.backupFreshnessClass !== "fresh") {
    reasons.push("backup_not_fresh");
  }
  if (inputs.sourceInventoryTotal <= 0) reasons.push("source_inventory_empty");
  if (!/^[a-f0-9]{64}$/u.test(inputs.sourceInventoryDigest)) {
    reasons.push("source_inventory_digest_invalid");
  }

  if (reasons.length > 0) {
    return { status: "blocked", reasons: [...new Set(reasons)].sort() };
  }

  const applied = new Set(inputs.appliedMigrations);
  const pendingMigrations = STABLE_REGISTRY_MIGRATION_SET.filter(
    (migration) => !applied.has(migration),
  );

  const plan: Omit<StableRegistryProductionPlan, "planDigest"> = {
    schemaVersion: STABLE_REGISTRY_PRODUCTION_PLAN_SCHEMA_VERSION,
    environment: inputs.environment,
    deploymentSha: inputs.deploymentSha,
    pendingMigrations: [...pendingMigrations],
    migrationSetDigest: planDigest([...STABLE_REGISTRY_MIGRATION_SET]),
    sourceInventoryTotal: inputs.sourceInventoryTotal,
    sourceInventoryDigest: inputs.sourceInventoryDigest,
    releasePolicyVersion: inputs.releasePolicyVersion,
    storageHeadroomClass: inputs.storageHeadroomClass,
    backupFreshnessClass: inputs.backupFreshnessClass,
    affectedObjectCount: inputs.affectedObjectCount,
    activeReleaseId: inputs.activeReleaseId,
  };

  return {
    status: "planned",
    plan: { ...plan, planDigest: planDigest(plan) },
  };
}

export type ApprovalState =
  | { status: "approved" }
  | { status: "pending"; reason: "no_approval_recorded" }
  | { status: "pending"; reason: "approved_digest_mismatch" }
  | { status: "pending"; reason: "input_drift" };

/**
 * Approval binds one digest. Regenerating the plan from drifted inputs produces
 * a different digest and therefore returns to pending — approval is never
 * inherited by a later plan.
 */
export function evaluateApproval(input: {
  plan: StableRegistryProductionPlan;
  approvedPlanDigest: string | null;
  currentInputs?: StableRegistryProductionPlanInputs;
}): ApprovalState {
  if (!input.approvedPlanDigest) {
    return { status: "pending", reason: "no_approval_recorded" };
  }
  if (input.approvedPlanDigest !== input.plan.planDigest) {
    return { status: "pending", reason: "approved_digest_mismatch" };
  }
  if (input.currentInputs) {
    const rebuilt = buildStableRegistryProductionPlan(input.currentInputs);
    if (
      rebuilt.status !== "planned" ||
      rebuilt.plan.planDigest !== input.plan.planDigest
    ) {
      return { status: "pending", reason: "input_drift" };
    }
  }
  return { status: "approved" };
}

/**
 * A mutating phase requires an exact environment match plus an approved digest.
 * A read-only phase requires neither, which is what makes classify and plan
 * safe to run at any time.
 */
export function canRunPhase(input: {
  phase: StableRegistryProductionPhase;
  environment: string;
  confirmEnvironment: string;
  approval: ApprovalState;
}): { allowed: boolean; reason?: string } {
  if (input.environment !== input.confirmEnvironment) {
    return { allowed: false, reason: "environment_confirmation_mismatch" };
  }
  const mutating = (
    STABLE_REGISTRY_MUTATING_PHASES as readonly string[]
  ).includes(input.phase);
  if (!mutating) return { allowed: true };
  if (input.approval.status !== "approved") {
    return { allowed: false, reason: "maintainer_approval_pending" };
  }
  return { allowed: true };
}

/** The exact next phase, so a run cannot skip a required predecessor. */
export function nextPhase(
  state: StableRegistryProductionState,
): StableRegistryProductionPhase | null {
  switch (state) {
    case "unclassified":
      return "classify";
    case "classified":
      return "plan";
    case "planned":
    case "approved":
      return "apply";
    case "applying":
      return "verify";
    case "verifying":
    case "active":
      return "rollback";
    case "rollback_verified":
      return "forward";
    case "forward_verified":
      return "cleanup";
    default:
      return null;
  }
}

export function planDigest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}
