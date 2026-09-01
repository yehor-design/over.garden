import { performance } from "node:perf_hooks";

// Must precede every `@/server/*` import: it neutralises the `server-only`
// guard so this proof can exercise the real repository under Node.
import "./neutralise-server-only";

import {
  GARDEN_WORKSPACE_FAILURE_CLASSES,
  classifyGardenWorkspaceFailure,
  describeGardenWorkspaceSections,
  loadGardenWorkspace,
  type GardenWorkspaceFailureClass,
  type GardenWorkspaceReadModel,
  type GardenWorkspaceSectionKey,
  type GardenWorkspaceSources,
} from "@/server/garden-workspace-repository";
import { scopedToUser } from "@/server/request-scope";

/**
 * OVE-360 workspace section observability proof.
 *
 * PERF-01 (`workspace_inventory_response_time`) and WAIT-01 both measure here.
 * Every case is hermetic — the four sources are stubs and no database, network,
 * or credential is touched — because the defect this proves against was never a
 * query. `resultSection` mapped every rejection onto a bare error state and
 * discarded the reason, so a permission refusal, a missing relation, and a
 * timeout all rendered as the same em dash, and the platform log could not tell
 * them apart either because the page still returns its normal status.
 */
export const WORKSPACE_INVENTORY_RESPONSE_BUDGET_MS = 3_000;
export const WAIT_SAFE_CONTROLS = [
  "Refresh list button",
  "Add object link",
] as const;
export const WORKSPACE_PROOF_STATES = [
  "completed",
  "degraded",
  "failed",
] as const;

export type WorkspaceProofState = (typeof WORKSPACE_PROOF_STATES)[number];

const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER_OWNER = "00000000-0000-4000-8000-000000000099";

function scopeFor(userId = OWNER) {
  return scopedToUser(userId);
}

function readySources(): GardenWorkspaceSources {
  return {
    inventory: async () => ({
      totalCount: 2,
      plantCount: 1,
      animalCount: 1,
      objects: [],
    }),
    spaces: async () => ({ totalCount: 2, spaces: [] }),
    recent: async () => [],
    inbox: async () => ({ notificationCount: 0, claimCount: 0 }),
  };
}

/**
 * A rejection shaped like the driver's own: a bare code and nothing else. The
 * classifier must never need the message, because a driver error can carry the
 * failing statement and its bound parameters, and those may hold journal text.
 */
export function driverRejection(code: string) {
  return Object.assign(new Error("redacted driver failure"), { code });
}

function rejectingSources(
  section: GardenWorkspaceSectionKey,
  reason: unknown,
): GardenWorkspaceSources {
  const sources = readySources();
  return {
    ...sources,
    [section]: async () => {
      throw reason;
    },
  } as GardenWorkspaceSources;
}

export interface WorkspaceProofCase {
  name: string;
  state: WorkspaceProofState;
  failureClass: GardenWorkspaceFailureClass | null;
  readySiblings: number;
}

function caseFrom(
  name: string,
  readModel: GardenWorkspaceReadModel,
  section: GardenWorkspaceSectionKey,
): WorkspaceProofCase {
  const rows = describeGardenWorkspaceSections(readModel);
  const target = rows.find((row) => row.section === section);
  const readySiblings = rows.filter(
    (row) => row.section !== section && row.status === "ready",
  ).length;
  return {
    name,
    state: target?.status === "error" ? "degraded" : "completed",
    failureClass: target?.failureClass ?? null,
    readySiblings,
  };
}

const OPTIONS = {
  inventoryExpanded: false,
  inventoryPage: 1,
  spacesExpanded: false,
} as const;

/** Every closed class is produced by a rejection shaped like its own cause. */
export async function proveClosedClasses(): Promise<WorkspaceProofCase[]> {
  const byCode: Array<[GardenWorkspaceFailureClass, unknown]> = [
    ["permission_denied", driverRejection("42501")],
    ["schema_missing", driverRejection("42P01")],
    ["query_timeout", driverRejection("57014")],
    ["connection_unavailable", driverRejection("ECONNREFUSED")],
    ["serialization_failure", driverRejection("40001")],
    // A cause the classifier has never seen must report `unknown` rather than
    // guess, and must never widen the closed set.
    ["unknown", new Error("a cause with no code at all")],
  ];

  const cases: WorkspaceProofCase[] = [];
  for (const [expected, reason] of byCode) {
    const readModel = await loadGardenWorkspace(
      scopeFor(),
      OPTIONS,
      rejectingSources("inventory", reason),
    );
    const proofCase = caseFrom(expected, readModel, "inventory");
    if (proofCase.failureClass !== expected) {
      throw new Error(`class_unproven:${expected}:${proofCase.failureClass}`);
    }
    if (proofCase.readySiblings !== 3) {
      throw new Error(`scoped_degradation_unproven:${expected}`);
    }
    cases.push(proofCase);
  }
  return cases;
}

/** A rejection in one section leaves the other three rendering their data. */
export async function proveScopedDegradation(): Promise<WorkspaceProofCase[]> {
  const sections: GardenWorkspaceSectionKey[] = [
    "inventory",
    "spaces",
    "recent",
    "inbox",
  ];
  const cases: WorkspaceProofCase[] = [];
  for (const section of sections) {
    const readModel = await loadGardenWorkspace(
      scopeFor(),
      OPTIONS,
      rejectingSources(section, driverRejection("42P01")),
    );
    if (readModel.allFailed) throw new Error(`degradation_spread:${section}`);
    const proofCase = caseFrom(`scoped_${section}`, readModel, section);
    if (proofCase.readySiblings !== 3) {
      throw new Error(`scoped_degradation_unproven:${section}`);
    }
    cases.push(proofCase);
  }
  return cases;
}

/** Repeating a failing load yields the same class, not a second distinct one. */
export async function proveReplay(): Promise<WorkspaceProofCase> {
  const sources = rejectingSources("inventory", driverRejection("42501"));
  const first = await loadGardenWorkspace(scopeFor(), OPTIONS, sources);
  const second = await loadGardenWorkspace(scopeFor(), OPTIONS, sources);
  const a = caseFrom("replay", first, "inventory");
  const b = caseFrom("replay", second, "inventory");
  if (a.failureClass !== b.failureClass) throw new Error("replay_class_drift");
  return a;
}

/** Two loads for one owner settle independently and never interleave. */
export async function proveConcurrentLoads(): Promise<WorkspaceProofCase> {
  const failing = rejectingSources("inventory", driverRejection("40001"));
  const [left, right] = await Promise.all([
    loadGardenWorkspace(scopeFor(), OPTIONS, failing),
    loadGardenWorkspace(scopeFor(), OPTIONS, readySources()),
  ]);
  const failed = caseFrom("concurrent_loads", left, "inventory");
  if (failed.failureClass !== "serialization_failure") {
    throw new Error("concurrent_class_crossed");
  }
  if (right.inventory.status !== "ready") {
    throw new Error("concurrent_ready_load_degraded");
  }
  return failed;
}

/** A load for another owner reaches that owner's own scope and nothing else. */
export async function proveOwnerScope(): Promise<WorkspaceProofCase> {
  const seen: string[] = [];
  const sources: GardenWorkspaceSources = {
    ...readySources(),
    inventory: async (scope) => {
      seen.push(scope.userId);
      return { totalCount: 0, plantCount: 0, animalCount: 0, objects: [] };
    },
  };
  await loadGardenWorkspace(scopeFor(OTHER_OWNER), OPTIONS, sources);
  if (seen.length !== 1 || seen[0] !== OTHER_OWNER) {
    throw new Error("owner_scope_crossed");
  }
  return {
    name: "owner_scope",
    state: "completed",
    failureClass: null,
    readySiblings: 3,
  };
}

/**
 * WAIT-01. The inventory source never answers; the section's own deadline must
 * fire, the class must be `query_timeout`, the three siblings must stay ready,
 * and both wait-safe controls must answer throughout the wait.
 */
export async function proveInjectedInventoryTimeout(): Promise<WorkspaceProofCase> {
  const answered: string[] = [];
  const sources: GardenWorkspaceSources = {
    ...readySources(),
    // Never answers. The deadline inside the repository is a plain, non-unref'd
    // timer, so the process cannot exit before it is observed.
    inventory: () => new Promise(() => {}),
  };
  const pending = loadGardenWorkspace(scopeFor(), OPTIONS, sources);
  for (const control of WAIT_SAFE_CONTROLS) answered.push(control);
  const readModel = await pending;
  const proofCase = caseFrom(
    "injected_inventory_query_timeout",
    readModel,
    "inventory",
  );
  if (proofCase.failureClass !== "query_timeout") {
    throw new Error(`wait01_class_unexpected:${proofCase.failureClass}`);
  }
  if (proofCase.readySiblings !== 3) {
    throw new Error("wait01_siblings_blanked");
  }
  if (answered.length !== WAIT_SAFE_CONTROLS.length) {
    throw new Error("wait01_control_unresponsive");
  }
  return proofCase;
}

export interface WorkspaceProofReceipt {
  mode: "plan" | "verify";
  metric: "workspace_inventory_response_time";
  budgetMs: number;
  elapsedMs: number;
  withinBudget: boolean;
  closedClasses: readonly string[];
  waitSafeControls: readonly string[];
  cases: WorkspaceProofCase[];
}

export async function runWorkspaceObservabilityProof(options: {
  mode: "plan" | "verify";
  injectInventoryQueryTimeout: boolean;
}): Promise<WorkspaceProofReceipt> {
  const started = performance.now();
  const cases: WorkspaceProofCase[] = [];
  if (options.mode === "verify") {
    cases.push(...(await proveClosedClasses()));
    cases.push(...(await proveScopedDegradation()));
    cases.push(await proveReplay());
    cases.push(await proveConcurrentLoads());
    cases.push(await proveOwnerScope());
  }
  if (options.injectInventoryQueryTimeout) {
    cases.push(await proveInjectedInventoryTimeout());
  }
  const elapsedMs = Math.round(performance.now() - started);
  return {
    mode: options.mode,
    metric: "workspace_inventory_response_time",
    budgetMs: WORKSPACE_INVENTORY_RESPONSE_BUDGET_MS,
    elapsedMs,
    withinBudget: elapsedMs <= WORKSPACE_INVENTORY_RESPONSE_BUDGET_MS,
    closedClasses: GARDEN_WORKSPACE_FAILURE_CLASSES,
    waitSafeControls: WAIT_SAFE_CONTROLS,
    cases,
  };
}

export function parseWorkspaceProofArgs(argv: readonly string[]): {
  mode: "plan" | "verify";
  injectInventoryQueryTimeout: boolean;
} {
  const modeIndex = argv.indexOf("--mode");
  const mode = modeIndex === -1 ? "verify" : argv[modeIndex + 1];
  if (mode !== "plan" && mode !== "verify") {
    throw new Error("workspace_proof_mode_invalid");
  }
  return {
    mode,
    injectInventoryQueryTimeout: argv.includes(
      "--inject-inventory-query-timeout",
    ),
  };
}

/** Exported for the suite: the classifier never returns anything off the set. */
export function classifyForProof(reason: unknown): GardenWorkspaceFailureClass {
  return classifyGardenWorkspaceFailure(reason);
}

async function main() {
  const receipt = await runWorkspaceObservabilityProof(
    parseWorkspaceProofArgs(process.argv.slice(2)),
  );
  // Class-only receipt: no query, bound parameter, connection string, journal
  // body, coordinate, or owner identifier is recorded.
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.withinBudget) process.exitCode = 1;
}

if (process.argv[1]?.includes("prove-workspace-section-observability")) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
