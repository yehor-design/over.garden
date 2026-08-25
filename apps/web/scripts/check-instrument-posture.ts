import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const INSTRUMENT_POSTURE_VERSION =
  "ove342.assertionClass.v2" as const;
export const INSTRUMENT_POSTURE_DEADLINE_MS = 120_000;

export const ACTIVE_INSTRUMENT_PATHS = [
  "apps/web/src/lib/catalog/deterministic-matching-rollout-proof.ts",
  "apps/web/scripts/prove-deterministic-matching-rollout.ts",
  "apps/web/scripts/smoke-catalog-alias-approval.ts",
  "apps/web/scripts/smoke-catalog-match-approval.ts",
  "apps/web/scripts/smoke-media-focal-presentation.ts",
] as const;

export const PREDECESSOR_RETIRED_PATHS = [
  "apps/web/scripts/verify-launch-media-quality.ts",
  "apps/web/scripts/smoke-online-composer-cutover.ts",
] as const;

export const OWNED_ELSEWHERE_INSTRUMENT_PATHS = [
  "apps/web/scripts/report-localization-coverage.ts",
  "apps/web/scripts/verify-responsive-accessibility.ts",
] as const;

export const PRESERVED_SCANNER_PATH =
  "apps/web/scripts/check-linear-contract-posture.ts";
export const RETIREMENT_GUARD_PATH =
  "apps/web/scripts/verify-retired-journal-media-runtime.ts";

export const ACTIVE_INSTRUMENT_COMMANDS = {
  "smoke:catalog-match-approval":
    "apps/web/scripts/smoke-catalog-match-approval.ts",
  "smoke:catalog-match-approval:seed-ui":
    "apps/web/scripts/smoke-catalog-match-approval.ts",
  "smoke:catalog-match-approval:reset-ui":
    "apps/web/scripts/smoke-catalog-match-approval.ts",
  "smoke:catalog-alias-approval":
    "apps/web/scripts/smoke-catalog-alias-approval.ts",
  "smoke:catalog-alias-approval:seed-ui":
    "apps/web/scripts/smoke-catalog-alias-approval.ts",
  "smoke:catalog-alias-approval:reset-ui":
    "apps/web/scripts/smoke-catalog-alias-approval.ts",
  "smoke:catalog-matching-rollout":
    "apps/web/scripts/prove-deterministic-matching-rollout.ts",
  "smoke:media-focal-presentation":
    "apps/web/scripts/smoke-media-focal-presentation.ts",
} as const;

export const PREDECESSOR_RETIRED_COMMANDS = [
  "verify:launch-media-quality",
  "smoke:launch-media-quality",
  "smoke:online-composer-cutover",
] as const;

export type InstrumentAssertionClass =
  | "retired_posture"
  | "preserved_control"
  | "owned_elsewhere"
  | "retired_by_predecessor"
  | "unclassified";

export type InstrumentPostureStatus =
  | "idle"
  | "scanning"
  | "aligned"
  | "posture_drift"
  | "timed_out"
  | "cancelled"
  | "failed"
  | "scan_already_running";

export interface InstrumentPostureSnapshot {
  files: Record<string, string>;
  packageScripts: Record<string, string>;
}

export interface InstrumentPostureEntry {
  path: string;
  assertion: string;
  class: InstrumentAssertionClass;
  reason: string;
  owner?: string;
  servedClass?: "exact" | "generated" | "clamped";
}

export interface InstrumentCommandMapping {
  command: string;
  path: string;
}

export interface InstrumentPostureViolation {
  code: string;
  path?: string;
  assertion?: string;
  command?: string;
}

export interface InstrumentPostureReceipt {
  version: typeof INSTRUMENT_POSTURE_VERSION;
  status: InstrumentPostureStatus;
  counts: {
    activePaths: number;
    predecessorRetiredPaths: number;
    activeCommands: number;
    predecessorRetiredCommands: number;
    preservedControlAssertions: number;
    ownedElsewherePaths: number;
    retiredPostureAssertions: number;
    unclassified: number;
  };
  entries: InstrumentPostureEntry[];
  commandMap: InstrumentCommandMapping[];
  durationMs: number;
  semanticDigest: string;
  violations: InstrumentPostureViolation[];
}

interface RequiredAssertion {
  path: (typeof ACTIVE_INSTRUMENT_PATHS)[number];
  assertion: string;
  marker: string;
  pattern?: RegExp;
  reason: string;
  servedClass?: "exact" | "generated" | "clamped";
}

const REQUIRED_ASSERTIONS: readonly RequiredAssertion[] = [
  {
    path: "apps/web/src/lib/catalog/deterministic-matching-rollout-proof.ts",
    assertion: "approvedCanonicalServeClass",
    marker: 'requireExactString(canonicalMatch, "approvedCanonicalServeClass", "exact")',
    pattern:
      /requireExactString\([\s\S]*?canonicalMatch,\s*"approvedCanonicalServeClass",\s*"exact"/,
    reason: "aggregate proof requires the canonical served class",
    servedClass: "exact",
  },
  {
    path: "apps/web/src/lib/catalog/deterministic-matching-rollout-proof.ts",
    assertion: "legacyWorkerCompatibilityPreservesSuggestionOnly",
    marker: '"legacyWorkerCompatibilityPreservesSuggestionOnly"',
    reason: "legacy worker compatibility remains suggestion-only",
  },
  {
    path: "apps/web/src/lib/catalog/deterministic-matching-rollout-proof.ts",
    assertion: "approvedAliasServeClass",
    marker: 'requireExactString(aliasReview, "approvedAliasServeClass", "generated")',
    pattern:
      /requireExactString\([\s\S]*?aliasReview,\s*"approvedAliasServeClass",\s*"generated"/,
    reason: "aggregate proof requires the generated-alias served class",
    servedClass: "generated",
  },
  {
    path: "apps/web/src/lib/catalog/deterministic-matching-rollout-proof.ts",
    assertion: "staleSourceApprovalPreservesCanonicalState",
    marker: '"staleSourceApprovalPreservesCanonicalState"',
    reason: "stale approval preserves canonical state",
  },
  {
    path: "apps/web/src/lib/catalog/deterministic-matching-rollout-proof.ts",
    assertion: "authenticatedGardenSurface",
    marker:
      'requireExactString(gardener, "gardenSurface", "operational_home")',
    pattern:
      /requireExactString\(\s*gardener,\s*"gardenSurface",\s*"operational_home"/,
    reason: "aggregate proof requires the authenticated operational surface",
  },
  {
    path: "apps/web/scripts/prove-deterministic-matching-rollout.ts",
    assertion: "aggregateMatchingReceipt",
    marker: "buildLocalDeterministicMatchingRolloutEvidence",
    reason: "rollout runner consumes the converted smoke receipts",
  },
  {
    path: "apps/web/scripts/prove-deterministic-matching-rollout.ts",
    assertion: "canonicalSmokeCommand",
    marker: 'runPackageJsonScript("smoke:catalog-match-approval")',
    reason: "rollout runner invokes the canonical smoke",
  },
  {
    path: "apps/web/scripts/prove-deterministic-matching-rollout.ts",
    assertion: "aliasSmokeCommand",
    marker: 'runPackageJsonScript("smoke:catalog-alias-approval")',
    reason: "rollout runner invokes the alias smoke",
  },
  {
    path: "apps/web/scripts/smoke-catalog-alias-approval.ts",
    assertion: "approvedAliasServeClass",
    marker: 'approvedAliasServeClass: "generated"',
    reason: "approved generated alias is served",
    servedClass: "generated",
  },
  {
    path: "apps/web/scripts/smoke-catalog-alias-approval.ts",
    assertion: "staleSourceApprovalPreservesCanonicalState",
    marker: "staleSourceApprovalPreservesCanonicalState: true",
    reason: "stale approval remains a no-mutation control",
  },
  {
    path: "apps/web/scripts/smoke-catalog-match-approval.ts",
    assertion: "approvedCanonicalServeClass",
    marker: 'approvedCanonicalServeClass: "exact"',
    reason: "approved canonical identity is served",
    servedClass: "exact",
  },
  {
    path: "apps/web/scripts/smoke-catalog-match-approval.ts",
    assertion: "legacyWorkerCompatibilityPreservesSuggestionOnly",
    marker: "legacyWorkerCompatibilityPreservesSuggestionOnly: true",
    reason: "legacy no-safe-match rows remain suggestion-only",
  },
  {
    path: "apps/web/scripts/smoke-media-focal-presentation.ts",
    assertion: "invalidFocalServeClass",
    marker: 'invalidFocalServeClass: "clamped"',
    reason: "invalid focal input is served with an explicit class",
    servedClass: "clamped",
  },
  {
    path: "apps/web/scripts/smoke-media-focal-presentation.ts",
    assertion: "containServesCenter",
    marker: "containServesCenter: true",
    reason: "contain presentation serves a safe centre position",
  },
] as const;

const RETIRED_ASSERTION_MARKERS = [
  "legacyWorkerRowsAcceptedFailClosed",
  "staleSourceEligibilityFailsClosed",
  "containFailClosedCenter",
  "invalidFocalCenters",
] as const;

export function evaluateInstrumentPosture(
  snapshot: InstrumentPostureSnapshot,
  options: { durationMs?: number } = {},
): InstrumentPostureReceipt {
  const entries: InstrumentPostureEntry[] = [];
  const commandMap: InstrumentCommandMapping[] = [];
  const violations: InstrumentPostureViolation[] = [];

  for (const activePath of ACTIVE_INSTRUMENT_PATHS) {
    const content = snapshot.files[activePath];
    if (content === undefined) {
      entries.push({
        path: activePath,
        assertion: "activeInstrumentPath",
        class: "unclassified",
        reason: "required active instrument is missing",
      });
      violations.push({ code: "active_path_missing", path: activePath });
      continue;
    }

    for (const required of REQUIRED_ASSERTIONS.filter(
      (assertion) => assertion.path === activePath,
    )) {
      if (
        required.pattern?.test(content) ?? content.includes(required.marker)
      ) {
        entries.push({
          path: activePath,
          assertion: required.assertion,
          class: "preserved_control",
          reason: required.reason,
          ...(required.servedClass
            ? { servedClass: required.servedClass }
            : {}),
        });
      } else {
        entries.push({
          path: activePath,
          assertion: required.assertion,
          class: "unclassified",
          reason: "required current-posture assertion is missing",
        });
        violations.push({
          code: "current_assertion_missing",
          path: activePath,
          assertion: required.assertion,
        });
      }
    }

    for (const retiredMarker of RETIRED_ASSERTION_MARKERS) {
      if (!content.includes(retiredMarker)) continue;
      entries.push({
        path: activePath,
        assertion: retiredMarker,
        class: "retired_posture",
        reason: "assertion names superseded refusal posture",
      });
      violations.push({
        code: "retired_assertion_present",
        path: activePath,
        assertion: retiredMarker,
      });
    }
  }

  const retirementGuard = snapshot.files[RETIREMENT_GUARD_PATH];
  if (retirementGuard === undefined) {
    entries.push({
      path: RETIREMENT_GUARD_PATH,
      assertion: "predecessorRetirementGuard",
      class: "unclassified",
      reason: "OVE-349 retirement guard is missing",
    });
    violations.push({
      code: "retirement_guard_missing",
      path: RETIREMENT_GUARD_PATH,
    });
  } else {
    entries.push({
      path: RETIREMENT_GUARD_PATH,
      assertion: "predecessorRetirementGuard",
      class: "preserved_control",
      reason: "OVE-349-owned guard remains read-only",
      owner: "OVE-349",
    });
  }

  for (const retiredPath of PREDECESSOR_RETIRED_PATHS) {
    const guardMarker = retiredPath.replace("apps/web/", "");
    if (snapshot.files[retiredPath] !== undefined) {
      entries.push({
        path: retiredPath,
        assertion: "predecessorRetiredPath",
        class: "unclassified",
        reason: "OVE-349-retired instrument reappeared",
        owner: "OVE-349",
      });
      violations.push({ code: "retired_path_reappeared", path: retiredPath });
    } else if (!retirementGuard?.includes(guardMarker)) {
      entries.push({
        path: retiredPath,
        assertion: "predecessorRetiredPath",
        class: "unclassified",
        reason: "retired path is absent but not owned by the retirement guard",
        owner: "OVE-349",
      });
      violations.push({
        code: "retired_path_guard_missing",
        path: retiredPath,
      });
    } else {
      entries.push({
        path: retiredPath,
        assertion: "predecessorRetiredPath",
        class: "retired_by_predecessor",
        reason: "path remains absent under the OVE-349 retirement guard",
        owner: "OVE-349",
      });
    }
  }

  for (const ownedPath of OWNED_ELSEWHERE_INSTRUMENT_PATHS) {
    if (snapshot.files[ownedPath] === undefined) {
      entries.push({
        path: ownedPath,
        assertion: "ownershipFence",
        class: "unclassified",
        reason: "ownership-fenced instrument is missing",
      });
      violations.push({ code: "owned_elsewhere_path_missing", path: ownedPath });
    } else {
      entries.push({
        path: ownedPath,
        assertion: "ownershipFence",
        class: "owned_elsewhere",
        reason: "instrument is outside OVE-342 edit ownership",
        owner: ownedPath.includes("localization") ? "OVE-178" : "OVE-182",
      });
    }
  }

  if (snapshot.files[PRESERVED_SCANNER_PATH] === undefined) {
    entries.push({
      path: PRESERVED_SCANNER_PATH,
      assertion: "linearContractScanner",
      class: "unclassified",
      reason: "preserved contract scanner is missing",
      owner: "OVE-341",
    });
    violations.push({
      code: "preserved_scanner_missing",
      path: PRESERVED_SCANNER_PATH,
    });
  } else {
    entries.push({
      path: PRESERVED_SCANNER_PATH,
      assertion: "linearContractScanner",
      class: "preserved_control",
      reason: "task-local contract scanner remains unchanged",
      owner: "OVE-341",
    });
  }

  for (const [command, ownerPath] of Object.entries(
    ACTIVE_INSTRUMENT_COMMANDS,
  )) {
    const commandValue = snapshot.packageScripts[command];
    const ownerMarker = ownerPath.replace("apps/web/", "");
    if (commandValue === undefined) {
      violations.push({ code: "active_command_missing", command });
      entries.push({
        path: "apps/web/package.json",
        assertion: command,
        class: "unclassified",
        reason: "active instrument command is missing",
      });
      continue;
    }
    if (!commandValue.includes(ownerMarker)) {
      violations.push({ code: "active_command_owner_drift", command });
      entries.push({
        path: "apps/web/package.json",
        assertion: command,
        class: "unclassified",
        reason: "active command no longer resolves to its owned instrument",
      });
      continue;
    }
    commandMap.push({ command, path: ownerPath });
  }

  for (const command of PREDECESSOR_RETIRED_COMMANDS) {
    if (snapshot.packageScripts[command] !== undefined) {
      violations.push({ code: "retired_command_reappeared", command });
      entries.push({
        path: "apps/web/package.json",
        assertion: command,
        class: "unclassified",
        reason: "OVE-349-retired command reappeared",
        owner: "OVE-349",
      });
    }
  }

  entries.sort((left, right) => entryKey(left).localeCompare(entryKey(right)));
  commandMap.sort((left, right) => left.command.localeCompare(right.command));
  violations.sort((left, right) =>
    violationKey(left).localeCompare(violationKey(right)),
  );

  const counts = {
    activePaths: ACTIVE_INSTRUMENT_PATHS.filter(
      (activePath) => snapshot.files[activePath] !== undefined,
    ).length,
    predecessorRetiredPaths: entries.filter(
      (entry) => entry.class === "retired_by_predecessor",
    ).length,
    activeCommands: commandMap.length,
    predecessorRetiredCommands: PREDECESSOR_RETIRED_COMMANDS.filter(
      (command) => snapshot.packageScripts[command] === undefined,
    ).length,
    preservedControlAssertions: entries.filter(
      (entry) => entry.class === "preserved_control",
    ).length,
    ownedElsewherePaths: entries.filter(
      (entry) => entry.class === "owned_elsewhere",
    ).length,
    retiredPostureAssertions: entries.filter(
      (entry) => entry.class === "retired_posture",
    ).length,
    unclassified: entries.filter((entry) => entry.class === "unclassified")
      .length,
  };
  const semanticDigest = digestSemanticVector({
    version: INSTRUMENT_POSTURE_VERSION,
    counts,
    entries,
    commandMap,
    violations,
  });

  return {
    version: INSTRUMENT_POSTURE_VERSION,
    status: violations.length === 0 ? "aligned" : "posture_drift",
    counts,
    entries,
    commandMap,
    durationMs: Math.max(0, Math.ceil(options.durationMs ?? 0)),
    semanticDigest,
    violations,
  };
}

export function runInstrumentPostureCheck(
  options: { repositoryRoot?: string } = {},
): InstrumentPostureReceipt {
  const startedAt = performance.now();
  const repositoryRoot = options.repositoryRoot ?? resolveRepositoryRoot();
  const snapshot = readInstrumentPostureSnapshot(repositoryRoot);
  return evaluateInstrumentPosture(snapshot, {
    durationMs: performance.now() - startedAt,
  });
}

export function formatInstrumentPostureReceipt(
  receipt: InstrumentPostureReceipt,
): string {
  return JSON.stringify({
    version: receipt.version,
    status: receipt.status,
    counts: receipt.counts,
    commandMap: receipt.commandMap,
    durationMs: receipt.durationMs,
    semanticDigest: receipt.semanticDigest,
    violations: receipt.violations,
  });
}

interface InstrumentPostureScanSessionDeps {
  readSnapshot?: (
    repositoryRoot: string,
    signal: AbortSignal,
  ) => Promise<InstrumentPostureSnapshot>;
  now?: () => number;
}

export class InstrumentPostureScanSession {
  private readonly readSnapshot: NonNullable<
    InstrumentPostureScanSessionDeps["readSnapshot"]
  >;
  private readonly now: () => number;
  private generation = 0;
  private controller: AbortController | null = null;
  private receipt = emptyTerminalReceipt("idle", []);

  constructor(deps: InstrumentPostureScanSessionDeps = {}) {
    this.readSnapshot = deps.readSnapshot ?? readSnapshotAsync;
    this.now = deps.now ?? (() => performance.now());
  }

  inspectInstrumentStatusCommand(): InstrumentPostureReceipt {
    return structuredClone(this.receipt);
  }

  cancelInstrumentClassificationCommand(): InstrumentPostureReceipt {
    if (this.receipt.status === "scanning") {
      this.generation += 1;
      this.controller?.abort("operator_cancelled");
      this.receipt = emptyTerminalReceipt("cancelled", [
        { code: "scan_cancelled" },
      ]);
    }
    return this.inspectInstrumentStatusCommand();
  }

  async start(
    options: { repositoryRoot?: string; deadlineMs?: number } = {},
  ): Promise<InstrumentPostureReceipt> {
    if (this.receipt.status === "scanning") {
      return {
        ...emptyTerminalReceipt("scan_already_running", [
          { code: "scan_already_running" },
        ]),
        durationMs: this.receipt.durationMs,
      };
    }
    const deadlineMs = options.deadlineMs ?? INSTRUMENT_POSTURE_DEADLINE_MS;
    if (
      !Number.isFinite(deadlineMs) ||
      deadlineMs <= 0 ||
      deadlineMs > INSTRUMENT_POSTURE_DEADLINE_MS
    ) {
      throw new TypeError(
        `Instrument posture deadline must be within ${INSTRUMENT_POSTURE_DEADLINE_MS}ms.`,
      );
    }

    const startedAt = this.now();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.receipt = emptyTerminalReceipt("scanning", []);

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snapshot = await Promise.race([
        this.readSnapshot(
          options.repositoryRoot ?? resolveRepositoryRoot(),
          controller.signal,
        ),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new InstrumentScanError("tracked_file_read_timeout")),
            deadlineMs,
          );
        }),
      ]);
      if (generation !== this.generation || controller.signal.aborted) {
        return this.inspectInstrumentStatusCommand();
      }
      this.receipt = evaluateInstrumentPosture(snapshot, {
        durationMs: this.now() - startedAt,
      });
    } catch (error) {
      if (generation !== this.generation) {
        return this.inspectInstrumentStatusCommand();
      }
      controller.abort("classification_terminal");
      const timedOut =
        error instanceof InstrumentScanError &&
        error.code === "tracked_file_read_timeout";
      this.receipt = {
        ...emptyTerminalReceipt(timedOut ? "timed_out" : "failed", [
          {
            code: timedOut
              ? "tracked_file_read_timeout"
              : "tracked_file_read_failed",
          },
        ]),
        durationMs: Math.max(0, Math.ceil(this.now() - startedAt)),
      };
    } finally {
      if (timer) clearTimeout(timer);
      if (generation === this.generation) this.controller = null;
    }

    return this.inspectInstrumentStatusCommand();
  }
}

export function parseInstrumentPostureArguments(arguments_: readonly string[]) {
  const normalized = arguments_.filter((argument) => argument !== "--");
  let proveDeterminism = false;
  let injectDependencyTimeout = false;
  let emitAggregateReceipt = false;

  for (const argument of normalized) {
    if (argument === "--prove-determinism") {
      proveDeterminism = true;
      continue;
    }
    if (argument === "--inject-dependency-timeout") {
      injectDependencyTimeout = true;
      continue;
    }
    if (argument === "--emit-aggregate-receipt") {
      emitAggregateReceipt = true;
      continue;
    }
    throw new Error("unknown_argument");
  }

  return { proveDeterminism, injectDependencyTimeout, emitAggregateReceipt };
}

class InstrumentScanError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function readInstrumentPostureSnapshot(
  repositoryRoot: string,
): InstrumentPostureSnapshot {
  const files: Record<string, string> = {};
  for (const relativePath of measuredFilePaths()) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    if (existsSync(absolutePath)) {
      files[relativePath] = readFileSync(absolutePath, "utf8");
    }
  }
  const packageJson = JSON.parse(
    readFileSync(path.join(repositoryRoot, "apps/web/package.json"), "utf8"),
  ) as { scripts?: Record<string, unknown> };
  return {
    files,
    packageScripts: normalizePackageScripts(packageJson.scripts),
  };
}

async function readSnapshotAsync(
  repositoryRoot: string,
  signal: AbortSignal,
): Promise<InstrumentPostureSnapshot> {
  const files: Record<string, string> = {};
  for (const relativePath of measuredFilePaths()) {
    if (signal.aborted) throw new InstrumentScanError("scan_cancelled");
    const absolutePath = path.join(repositoryRoot, relativePath);
    if (!existsSync(absolutePath)) continue;
    files[relativePath] = await readFile(absolutePath, {
      encoding: "utf8",
      signal,
    });
  }
  if (signal.aborted) throw new InstrumentScanError("scan_cancelled");
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "apps/web/package.json"), {
      encoding: "utf8",
      signal,
    }),
  ) as { scripts?: Record<string, unknown> };
  return {
    files,
    packageScripts: normalizePackageScripts(packageJson.scripts),
  };
}

function measuredFilePaths(): string[] {
  return [
    ...ACTIVE_INSTRUMENT_PATHS,
    ...PREDECESSOR_RETIRED_PATHS,
    ...OWNED_ELSEWHERE_INSTRUMENT_PATHS,
    PRESERVED_SCANNER_PATH,
    RETIREMENT_GUARD_PATH,
  ];
}

function normalizePackageScripts(
  scripts: Record<string, unknown> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scripts ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function emptyTerminalReceipt(
  status: InstrumentPostureStatus,
  violations: InstrumentPostureViolation[],
): InstrumentPostureReceipt {
  const counts = {
    activePaths: 0,
    predecessorRetiredPaths: 0,
    activeCommands: 0,
    predecessorRetiredCommands: 0,
    preservedControlAssertions: 0,
    ownedElsewherePaths: 0,
    retiredPostureAssertions: 0,
    unclassified: 0,
  };
  return {
    version: INSTRUMENT_POSTURE_VERSION,
    status,
    counts,
    entries: [],
    commandMap: [],
    durationMs: 0,
    semanticDigest: digestSemanticVector({
      version: INSTRUMENT_POSTURE_VERSION,
      counts,
      entries: [],
      commandMap: [],
      violations,
    }),
    violations,
  };
}

function digestSemanticVector(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function entryKey(entry: InstrumentPostureEntry) {
  return `${entry.path}\0${entry.assertion}\0${entry.class}`;
}

function violationKey(violation: InstrumentPostureViolation) {
  return `${violation.code}\0${violation.path ?? ""}\0${
    violation.assertion ?? ""
  }\0${violation.command ?? ""}`;
}

function resolveRepositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

async function main() {
  const options = parseInstrumentPostureArguments(process.argv.slice(2));
  const primary = await new InstrumentPostureScanSession().start();
  let determinism: { checked: boolean; matched: boolean } = {
    checked: false,
    matched: false,
  };
  if (options.proveDeterminism) {
    const replay = await new InstrumentPostureScanSession().start();
    determinism = {
      checked: true,
      matched:
        primary.status === "aligned" &&
        replay.status === "aligned" &&
        primary.semanticDigest === replay.semanticDigest,
    };
  }

  let timeoutProbe: { checked: boolean; status: string } = {
    checked: false,
    status: "not_requested",
  };
  if (options.injectDependencyTimeout) {
    const timeoutSession = new InstrumentPostureScanSession({
      readSnapshot: async () => new Promise<InstrumentPostureSnapshot>(() => {}),
    });
    const timeout = await timeoutSession.start({ deadlineMs: 5 });
    timeoutProbe = { checked: true, status: timeout.status };
  }

  const ok =
    primary.status === "aligned" &&
    (!options.proveDeterminism || determinism.matched) &&
    (!options.injectDependencyTimeout || timeoutProbe.status === "timed_out");
  const aggregate = {
    schemaVersion: "ove342.instrumentPostureAggregate.v1",
    ok,
    receipt: JSON.parse(formatInstrumentPostureReceipt(primary)),
    determinism,
    timeoutProbe,
    writesTrackedFiles: false,
    productionDataTouched: false,
  };
  console.log(JSON.stringify(aggregate, null, 2));
  if (!ok) process.exitCode = 1;
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  void main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        ok: false,
        schemaVersion: "ove342.instrumentPostureAggregate.v1",
        errorClass: error instanceof Error ? error.name : "unknown_error",
      }),
    );
    process.exitCode = 1;
  });
}
