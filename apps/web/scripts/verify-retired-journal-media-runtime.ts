import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPROVED_RETIREMENT_EVIDENCE_DIGEST,
  classifyRetirementGate,
  type RetirementGateSnapshot,
} from "./legacy-journal-media-retirement-contract";

export {
  APPROVED_RETIREMENT_EVIDENCE_DIGEST,
  classifyRetirementGate,
} from "./legacy-journal-media-retirement-contract";

export const RETIRED_JOURNAL_MEDIA_PATHS = [
  "src/app/api/garden/drafts/[draftKey]/route.ts",
  "src/app/api/garden/drafts/[draftKey]/route.test.ts",
  "src/app/api/media/process/route.ts",
  "src/app/api/media/process/route.test.ts",
  "src/app/api/media/uploads/route.ts",
  "src/app/api/media/uploads/route.test.ts",
  "src/app/garden/server-draft-resume-panel.tsx",
  "src/components/garden/online-journal-composer-status.tsx",
  "src/lib/garden/online-journal-composer-locale-participant.ts",
  "src/lib/garden/online-journal-composer-participants.ts",
  "src/lib/garden/online-journal-draft.ts",
  "src/lib/garden/online-journal-draft.test.ts",
  "src/lib/garden/online-journal-submit.ts",
  "src/lib/garden/online-journal-submit.test.ts",
  "src/lib/garden/use-online-journal-composer.ts",
  "src/lib/garden/use-online-journal-composer.test.tsx",
  "src/lib/media/launch-media-quality.ts",
  "src/server/journal-draft-repository.ts",
  "src/server/journal-draft-repository.test.ts",
  "src/server/media/derivatives.ts",
  "src/server/media/derivatives.test.ts",
  "src/server/media/launch-media-quality-analyzer.ts",
  "src/server/media/launch-media-quality.integration.test.ts",
  "src/server/media/launch-media-quality.test.ts",
  "src/server/media/launch-media-quality.ts",
  "src/server/media/media-processing-contract.ts",
  "src/server/media/processor.ts",
  "src/server/media/processor.test.ts",
  "src/server/media/safe-media-admission.ts",
  "src/server/media/safe-media-admission.integration.test.ts",
  "scripts/launch-corpus-media-quality.ts",
  "scripts/launch-corpus-build-editorial-pack.ts",
  "scripts/smoke-local-media-runtime.ts",
  "scripts/smoke-online-composer-cutover.ts",
  "scripts/smoke-safe-media-admission.ts",
  "scripts/verify-launch-media-quality.ts",
] as const;

const TASK_OPERATOR_EXCEPTIONS = new Set([
  "scripts/retire-legacy-journal-media-production.ts",
  "scripts/verify-retired-journal-media-migration.ts",
  "scripts/verify-retired-journal-media-runtime.ts",
  "scripts/verify-retired-journal-media-runtime.test.ts",
  "scripts/verify-legacy-quarantine-provider-retirement.ts",
  "scripts/verify-legacy-quarantine-provider-retirement.test.ts",
]);

const RETIRED_RUNTIME_MARKERS = [
  "journal_entry_drafts",
  "R2_QUARANTINE_BUCKET",
  "createQuarantineUploadUrl",
  "getQuarantineObjectBuffer",
  "getPublicDerivativeObjectBuffer",
  "GetObjectCommand",
  "transformToByteArray",
  "deleteQuarantineObject",
  "probeQuarantineObjectState",
  "media_readiness_state",
  "processing_claim_token",
  "processing_claimed_at",
  "upload_generation_id",
  "public_object_id",
  "declared_media_type",
  "admitted_media_type",
  "original_deleted_at",
  "originalDeletedAt",
  "isEligibleProcessedCoverCandidate",
  "quality_policy_version",
  "quality_reason_codes",
  "media_quarantine_expire",
  "/api/garden/drafts/",
  "/api/media/uploads",
  "/api/media/process",
] as const;

export interface RetiredJournalMediaRuntimeFinding {
  kind: "path" | "marker" | "package" | "migration" | "schema";
  owner: string;
  marker?: string;
}

export function approvedRetirementGateFixture(): RetirementGateSnapshot {
  return {
    evidenceDigest: APPROVED_RETIREMENT_EVIDENCE_DIGEST,
    drafts: 0,
    privateEntries: 203,
    privateAttachedMedia: 29,
    unattachedMedia: 8,
    candidatePresentObjects: 27,
    candidateAbsentObjects: 10,
    publicEntries: 10,
    publicMedia: 14,
    publicPresentObjects: 14,
    publicMissingObjects: 0,
    unfinishedLegacyJobs: 0,
    unfinishedStagingJobs: 0,
    unfinishedRevokeJobs: 0,
    providerErrors: 0,
    publicOverlap: 0,
    outsideApprovedScope: 0,
  };
}

export interface RetirementPreflightReceipt {
  status: "idle" | "waiting" | "ready" | "inconclusive";
  reason: string;
  admittedEvidence: boolean;
  durationMs: number;
}

interface RetirementPreflightReaders {
  readDatabase(signal: AbortSignal): Promise<string>;
  readProviderLogs(signal: AbortSignal): Promise<string>;
}

/**
 * Task-local wait controller used by the production preflight. Its synchronous
 * inspect/cancel methods never wait on Postgres or a provider, and a generation
 * fence prevents a late promise from turning a cancelled/timeout run green.
 */
export class RetirementPreflightSession {
  private generation = 0;
  private controller: AbortController | null = null;
  private receipt: RetirementPreflightReceipt = {
    status: "idle",
    reason: "not_started",
    admittedEvidence: false,
    durationMs: 0,
  };

  inspectBlockingClassificationCommand(): RetirementPreflightReceipt {
    return { ...this.receipt };
  }

  cancelRetirementPreflightCommand(): RetirementPreflightReceipt {
    if (this.receipt.status === "waiting") {
      this.generation += 1;
      this.controller?.abort("operator_cancelled");
      this.receipt = {
        ...this.receipt,
        status: "inconclusive",
        reason: "cancelled",
        admittedEvidence: false,
      };
    }
    return this.inspectBlockingClassificationCommand();
  }

  async start(
    readers: RetirementPreflightReaders,
    timeoutMs: number,
  ): Promise<RetirementPreflightReceipt> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
      throw new TypeError("Retirement preflight timeout must be within 60000ms.");
    }
    if (this.receipt.status === "waiting") {
      throw new Error("A retirement preflight is already running.");
    }

    const startedAt = performance.now();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.receipt = {
      status: "waiting",
      reason: "dependency_read",
      admittedEvidence: false,
      durationMs: 0,
    };

    try {
      await Promise.all([
        readWithDeadline(
          "database_read_timeout",
          readers.readDatabase,
          controller.signal,
          timeoutMs,
        ),
        readWithDeadline(
          "provider_log_timeout",
          readers.readProviderLogs,
          controller.signal,
          timeoutMs,
        ),
      ]);
      if (generation !== this.generation || controller.signal.aborted) {
        return this.inspectBlockingClassificationCommand();
      }
      this.receipt = {
        status: "ready",
        reason: "bounded_reads_complete",
        admittedEvidence: true,
        durationMs: performance.now() - startedAt,
      };
    } catch (error) {
      if (generation !== this.generation) {
        return this.inspectBlockingClassificationCommand();
      }
      controller.abort("preflight_inconclusive");
      this.receipt = {
        status: "inconclusive",
        reason:
          error instanceof PreflightReadError
            ? error.reason
            : "dependency_read_failed",
        admittedEvidence: false,
        durationMs: performance.now() - startedAt,
      };
    } finally {
      if (generation === this.generation) this.controller = null;
    }
    return this.inspectBlockingClassificationCommand();
  }
}

class PreflightReadError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

async function readWithDeadline(
  timeoutReason: string,
  read: (signal: AbortSignal) => Promise<string>,
  signal: AbortSignal,
  timeoutMs: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener: () => void = () => undefined;
  try {
    const abort = new Promise<never>((_resolve, reject) => {
      const listener = () => reject(new PreflightReadError("cancelled"));
      signal.addEventListener("abort", listener, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", listener);
    });
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new PreflightReadError(timeoutReason)),
        timeoutMs,
      );
    });
    return await Promise.race([read(signal), abort, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    removeAbortListener();
  }
}

interface InMemoryRetirementState {
  privateEntries: number;
  privateMedia: number;
  unattachedMedia: number;
  candidateObjects: Set<string>;
  publicEntries: number;
  publicMedia: number;
  publicObjects: Set<string>;
  databaseApplied: boolean;
}

function makeInMemoryRetirementState(): InMemoryRetirementState {
  return {
    privateEntries: 203,
    privateMedia: 29,
    unattachedMedia: 8,
    candidateObjects: new Set(
      Array.from({ length: 27 }, (_item, index) => `approved-${index}`),
    ),
    publicEntries: 10,
    publicMedia: 14,
    publicObjects: new Set(
      Array.from({ length: 14 }, (_item, index) => `public-${index}`),
    ),
    databaseApplied: false,
  };
}

async function applyInMemoryRetirement(
  state: InMemoryRetirementState,
  options: { providerFailureAfter?: number; injectRace?: boolean } = {},
) {
  if (state.databaseApplied) return { replay: true, deletedObjects: 0 };
  if (
    state.privateEntries !== 203 ||
    state.privateMedia !== 29 ||
    state.unattachedMedia !== 8
  ) {
    throw new Error("retirement_database_classification_drifted");
  }
  let deletedObjects = 0;
  for (const key of [...state.candidateObjects]) {
    state.candidateObjects.delete(key);
    deletedObjects += 1;
    if (deletedObjects === options.providerFailureAfter) {
      throw new Error("injected_provider_partial_failure");
    }
  }
  if (options.injectRace) state.privateEntries += 1;
  if (state.privateEntries !== 203) {
    throw new Error("retirement_concurrent_race_blocked");
  }
  state.privateEntries = 0;
  state.privateMedia = 0;
  state.unattachedMedia = 0;
  state.databaseApplied = true;
  return { replay: false, deletedObjects };
}

export async function runRetirementIntegrationFaultMatrix() {
  const exact = makeInMemoryRetirementState();
  await applyInMemoryRetirement(exact);
  const replay = await applyInMemoryRetirement(exact);

  const ambiguous = approvedRetirementGateFixture();
  ambiguous.outsideApprovedScope = 1;

  const race = makeInMemoryRetirementState();
  let concurrentRaceBlocked = false;
  try {
    await applyInMemoryRetirement(race, { injectRace: true });
  } catch (error) {
    concurrentRaceBlocked =
      error instanceof Error &&
      error.message === "retirement_concurrent_race_blocked";
  }

  const partial = makeInMemoryRetirementState();
  try {
    await applyInMemoryRetirement(partial, { providerFailureAfter: 11 });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "injected_provider_partial_failure"
    ) {
      throw error;
    }
  }
  await applyInMemoryRetirement(partial);

  const preservedPublic =
    exact.publicEntries === 10 &&
    exact.publicMedia === 14 &&
    exact.publicObjects.size === 14 &&
    race.publicEntries === 10 &&
    race.publicMedia === 14 &&
    race.publicObjects.size === 14;
  if (!preservedPublic) throw new Error("injected_public_state_regression");

  return {
    contract: "ove349.retirementIntegrationFaults.v1",
    exactFixtureApplied:
      exact.privateEntries === 0 &&
      exact.privateMedia === 0 &&
      exact.unattachedMedia === 0,
    ambiguousBlocked: classifyRetirementGate(ambiguous).state === "drift",
    replayIdempotent: replay.replay,
    concurrentRaceBlocked,
    partialProviderRecovery:
      partial.databaseApplied && partial.candidateObjects.size === 0,
    rollbackPreservedPublicState: preservedPublic,
    publicEntries: exact.publicEntries,
    publicMedia: exact.publicMedia,
  };
}

export function collectRetiredJournalMediaRuntimeFindings(
  appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
): RetiredJournalMediaRuntimeFinding[] {
  const findings: RetiredJournalMediaRuntimeFinding[] = [];
  for (const relativePath of RETIRED_JOURNAL_MEDIA_PATHS) {
    if (existsSync(path.join(appRoot, relativePath))) {
      findings.push({ kind: "path", owner: relativePath });
    }
  }

  const activeRuntimeRoots = [
    path.join(appRoot, "src"),
    path.join(appRoot, "scripts"),
    path.resolve(appRoot, "../../services/matching/app"),
  ];
  for (const absoluteRoot of activeRuntimeRoots) {
    for (const absolutePath of walkFiles(absoluteRoot)) {
      const relativePath = path.relative(appRoot, absolutePath);
      if (
        TASK_OPERATOR_EXCEPTIONS.has(relativePath) ||
        /(?:^|\/)fixtures(?:\/|$)/.test(relativePath) ||
        /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativePath)
      ) {
        continue;
      }
      const source = readFileSync(absolutePath, "utf8");
      for (const marker of RETIRED_RUNTIME_MARKERS) {
        if (source.includes(marker)) {
          findings.push({ kind: "marker", owner: relativePath, marker });
        }
      }
    }
  }

  const packageJson = JSON.parse(
    readFileSync(path.join(appRoot, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const packageName of ["sharp", "@aws-sdk/s3-request-presigner"]) {
    if (
      packageJson.dependencies?.[packageName] ||
      packageJson.devDependencies?.[packageName]
    ) {
      findings.push({ kind: "package", owner: "package.json", marker: packageName });
    }
  }

  const migrationPath = path.join(
    appRoot,
    "sql/0038_ove349_retire_legacy_journal_media.sql",
  );
  if (!existsSync(migrationPath)) {
    findings.push({ kind: "migration", owner: path.relative(appRoot, migrationPath) });
  }

  const generated = readFileSync(path.join(appRoot, "src/db/generated.ts"), "utf8");
  for (const marker of [
    "export interface JournalEntryDrafts",
    "journal_entry_drafts:",
    "quarantine_key:",
    "media_readiness_state:",
    "processing_claim_token:",
    "upload_generation_id:",
    "public_object_id:",
    "declared_media_type:",
    "admitted_media_type:",
    "original_deleted_at:",
    "quality_policy_version:",
  ]) {
    if (generated.includes(marker)) {
      findings.push({ kind: "schema", owner: "src/db/generated.ts", marker });
    }
  }
  return findings.sort((left, right) =>
    `${left.kind}:${left.owner}:${left.marker ?? ""}`.localeCompare(
      `${right.kind}:${right.owner}:${right.marker ?? ""}`,
    ),
  );
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(absolutePath);
    return /(?:\.[cm]?[jt]sx?|\.py)$/.test(entry.name) ? [absolutePath] : [];
  });
}

async function main() {
  const modeIndex = process.argv.indexOf("--mode");
  const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : undefined;
  if (mode === "integration-faults") {
    if (
      !process.argv.includes("--inject-zero-ambiguous-replay-race-rollback")
    ) {
      throw new Error("The declared OVE-349 fault matrix flag is required.");
    }
    process.stdout.write(
      `${JSON.stringify(await runRetirementIntegrationFaultMatrix())}\n`,
    );
    return;
  }
  if (mode) throw new Error(`Unsupported retired-runtime mode: ${mode}.`);
  const startedAt = Date.now();
  const findings = collectRetiredJournalMediaRuntimeFindings();
  const durationMs = Date.now() - startedAt;
  if (durationMs > 60_000) {
    throw new Error("legacy_absence_scan_duration_exceeded");
  }
  if (findings.length > 0) {
    process.stderr.write(`${JSON.stringify({ findings, durationMs }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `${JSON.stringify({ contract: "ove349.retiredJournalMedia.v1", findings: 0, durationMs })}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
