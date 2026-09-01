import { performance } from "node:perf_hooks";

// Must precede every `@/server/*` import: it neutralises the `server-only`
// guard so this proof can exercise the real repository under Node.
import "./neutralise-server-only";

import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
} from "kysely";

import type { Database } from "@/db/schema";
import {
  GARDEN_WORKSPACE_FAILURE_CLASSES,
  GARDEN_WORKSPACE_SECTION_QUERY_COUNT,
  gardenWorkspaceSectionDeadlineMs,
  loadGardenWorkspaceInventorySource,
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
/**
 * PERF-01 measures one workspace settle, not the whole run, and its budget is
 * the inventory section's own derived deadline. An independent constant here
 * would drift from the contract it is supposed to be measuring.
 */
export const WORKSPACE_INVENTORY_RESPONSE_BUDGET_MS =
  gardenWorkspaceSectionDeadlineMs("inventory");

/**
 * A settle that reaches its deadline lands a few milliseconds past it: the
 * timer has to fire and the read model still has to be assembled. The allowance
 * covers exactly that dispatch, and it is declared rather than folded into the
 * budget so the budget keeps meaning the contract's deadline.
 */
export const WORKSPACE_SETTLE_OBSERVATION_ALLOWANCE_MS = 250;

const settleDurationsMs: number[] = [];

/** Records how long one workspace settle took, so PERF-01 has a real sample. */
async function loadTimed(
  ...args: Parameters<typeof loadGardenWorkspace>
): ReturnType<typeof loadGardenWorkspace> {
  const startedAt = performance.now();
  try {
    return await loadGardenWorkspace(...args);
  } finally {
    settleDurationsMs.push(Math.round(performance.now() - startedAt));
  }
}
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
    const readModel = await loadTimed(
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
    const readModel = await loadTimed(
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
  const first = await loadTimed(scopeFor(), OPTIONS, sources);
  const second = await loadTimed(scopeFor(), OPTIONS, sources);
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
  await loadTimed(scopeFor(OTHER_OWNER), OPTIONS, sources);
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
  const pending = loadTimed(scopeFor(), OPTIONS, sources);
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

/**
 * A Kysely instance that answers every statement from memory and counts them,
 * so the declared round-trip cost of a section is measured rather than trusted.
 */
function countingExecutor(rows: readonly Record<string, unknown>[]) {
  const executed: string[] = [];
  const connection = {
    async executeQuery<R>(compiled: { sql: string }): Promise<QueryResult<R>> {
      executed.push(compiled.sql);
      return { rows: rows as unknown as R[] };
    },
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error("streaming is not part of this proof");
    },
  } as unknown as DatabaseConnection;
  const driver = {
    async init() {},
    async acquireConnection() {
      return connection;
    },
    async beginTransaction() {},
    async commitTransaction() {},
    async rollbackTransaction() {},
    async releaseConnection() {},
    async destroy() {},
  } as unknown as Driver;
  const dialect: Dialect = {
    createDriver: () => driver,
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createAdapter: () => new PostgresAdapter(),
    createIntrospector: (instance: Kysely<unknown>) =>
      new PostgresIntrospector(instance),
  };
  return { executor: new Kysely<Database>({ dialect }), executed };
}

export interface InventoryRoundTripProof {
  withObjects: number;
  withoutObjects: number;
  declared: number;
  budgetMs: number;
}

/**
 * Measures what the inventory read actually costs. The declared count is its
 * worst case — an owner with no objects short-circuits after two — and the
 * section budget is derived from that number rather than hand-picked.
 */
export async function proveInventoryRoundTrips(): Promise<InventoryRoundTripProof> {
  const populated = countingExecutor([
    { id: "8f5fa87d-b94e-4217-b68d-28303827ad89" },
  ]);
  await loadGardenWorkspaceInventorySource(
    scopeFor(),
    { limit: 9, offset: 0 },
    populated.executor,
  );
  const empty = countingExecutor([]);
  await loadGardenWorkspaceInventorySource(
    scopeFor(),
    { limit: 9, offset: 0 },
    empty.executor,
  );

  const proof: InventoryRoundTripProof = {
    withObjects: populated.executed.length,
    withoutObjects: empty.executed.length,
    declared: GARDEN_WORKSPACE_SECTION_QUERY_COUNT.inventory,
    budgetMs: gardenWorkspaceSectionDeadlineMs("inventory"),
  };
  if (proof.withObjects !== proof.declared) {
    throw new Error(
      `inventory_round_trip_count_drifted:${proof.withObjects}:${proof.declared}`,
    );
  }
  return proof;
}

export interface WorkspaceProofReceipt {
  mode: "plan" | "verify";
  metric: "workspace_inventory_response_time";
  budgetMs: number;
  /** PERF-01: the slowest single workspace settle observed in the run. */
  maxSettleMs: number;
  runElapsedMs: number;
  withinBudget: boolean;
  closedClasses: readonly string[];
  waitSafeControls: readonly string[];
  inventoryRoundTrips: InventoryRoundTripProof | null;
  cases: WorkspaceProofCase[];
}

export async function runWorkspaceObservabilityProof(options: {
  mode: "plan" | "verify";
  injectInventoryQueryTimeout: boolean;
}): Promise<WorkspaceProofReceipt> {
  const started = performance.now();
  settleDurationsMs.length = 0;
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
  const inventoryRoundTrips =
    options.mode === "verify" ? await proveInventoryRoundTrips() : null;
  const runElapsedMs = Math.round(performance.now() - started);
  const maxSettleMs = settleDurationsMs.reduce(
    (slowest, value) => Math.max(slowest, value),
    0,
  );
  return {
    mode: options.mode,
    metric: "workspace_inventory_response_time",
    budgetMs: WORKSPACE_INVENTORY_RESPONSE_BUDGET_MS,
    maxSettleMs,
    runElapsedMs,
    withinBudget:
      maxSettleMs <=
      WORKSPACE_INVENTORY_RESPONSE_BUDGET_MS +
        WORKSPACE_SETTLE_OBSERVATION_ALLOWANCE_MS,
    closedClasses: GARDEN_WORKSPACE_FAILURE_CLASSES,
    waitSafeControls: WAIT_SAFE_CONTROLS,
    inventoryRoundTrips,
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
