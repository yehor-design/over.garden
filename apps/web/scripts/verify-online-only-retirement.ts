import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  runOnlineOnlyCanonCheck,
  type OnlineOnlyCanonReceipt,
} from "./check-online-only-canon";

export const ONLINE_ONLY_RETIREMENT_VERSION =
  "ove326.onlineOnlyRetirement.v1" as const;
export const ONLINE_ONLY_RETIREMENT_DEADLINE_MS = 5_000;
export const ONLINE_ONLY_RETIREMENT_READ_CONCURRENCY = 32;

const RETIRED_RUNTIME_PATTERN =
  /(?:\bEntrySyncStatus\b|\bsyncStatus\b|\bsync_status\b|\boffline_queued\b|\boffline_synced\b|\boffline_entry_queued\b|\boffline_entry_synced\b|(?:from|require\s*\()\s*["']dexie(?:["'/)]|$)|\bfake-indexeddb\b|serviceWorker\.register\s*\(|rel\s*=\s*["']manifest["']|manifest\.webmanifest|["']\/sw\.js["'])/iu;
const RETIRED_COPY_PATTERN =
  /(?:saved offline|works offline|available offline|offline[- ]first|queued for sync|will sync|sync(?:ing|ed) when (?:online|connected)|install (?:the |this )?(?:app|pwa)\b)/iu;
const BUILD_RETIRED_PATTERN =
  /(?:dexie|fake-indexeddb|journal-entry-sync|owner-vault-migration|foreground-autosync|offline_entry_(?:queued|synced)|EntrySyncStatus|syncStatus|sync_status)/iu;
const HISTORICAL_SEMANTIC_PATTERN =
  /(?:immutable historical provenance|historical provenance|non-operative|not current (?:guidance|authority)|superseded|dated (?:decision|baseline|receipt)|immutable completed-issue receipt)/iu;
const WILDCARD_PATTERN = /[*?{}]/u;
const TRUSTED_CANON_HISTORY_REASON =
  "binding online-only canon historical classification";

export type RetirementSurface =
  | "source"
  | "package"
  | "build"
  | "document"
  | "history"
  | "cleanup"
  | "guardrail";

export interface RetirementScanFile {
  relativePath: string;
  content: string;
  surface: RetirementSurface;
}

export interface RetirementClassifications {
  historical: Readonly<Record<string, string>>;
  guardrail: Readonly<Record<string, string>>;
  nameOnlyCleanup: Readonly<Record<string, string>>;
  productResearch: Readonly<Record<string, string>>;
  activeUnrelated: Readonly<Record<string, string>>;
}

export interface RetirementViolation {
  code:
    | "active_retired_runtime"
    | "active_retired_copy"
    | "retired_build_output"
    | "retired_direct_dependency"
    | "retired_lock_dependency"
    | "unclassified_retired_history"
    | "historical_semantic_fixture_missing"
    | "classification_wildcard_forbidden"
    | "cleanup_semantic_fixture_missing"
    | "cleanup_payload_access_forbidden"
    | "migration_constraint_drop_missing"
    | "migration_constraint_add_missing"
    | "migration_not_valid_missing"
    | "migration_row_mutation_forbidden"
    | "migration_retired_event_name"
    | "bootstrap_retired_event_name"
    | "immutable_history_retired_event_missing";
  relativePath?: string;
  detail?: string;
}

export interface OnlineOnlyRetirementReceipt {
  version: typeof ONLINE_ONLY_RETIREMENT_VERSION;
  resultClass: "aligned" | "violations_found" | "degraded_timeout";
  failureClass: "none" | "classified_violation" | "scan_timeout";
  scannedFileCount: number;
  matchedFileCount: number;
  activeViolationCount: number;
  counts: {
    active: number;
    guardrail: number;
    historical_provenance: number;
    name_only_cleanup: number;
    product_research: number;
    active_unrelated: number;
    build: number;
  };
  buildOutputChecked: boolean;
  checkedChunkCount: number;
  canonStatus: OnlineOnlyCanonReceipt["status"] | "not_checked";
  durationMs: number;
  digest: string;
  violations: RetirementViolation[];
  evidenceSafety: "counts_classes_paths_and_digests_only";
}

interface EvaluateOptions {
  classifications: RetirementClassifications;
  now?: () => number;
  deadlineMs?: number;
  buildOutputChecked?: boolean;
  checkedChunkCount?: number;
  canonStatus?: OnlineOnlyCanonReceipt["status"] | "not_checked";
}

export function evaluateOnlineOnlyRetirement(
  files: readonly RetirementScanFile[],
  options: EvaluateOptions,
): OnlineOnlyRetirementReceipt {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const deadlineMs = options.deadlineMs ?? ONLINE_ONLY_RETIREMENT_DEADLINE_MS;
  const violations: RetirementViolation[] = [];
  const counts = emptyCounts();
  const matchedEvidence: Array<{
    relativePath: string;
    surface: RetirementSurface;
    classification: string;
    contentSha256: string;
  }> = [];

  for (const [classification, rules] of Object.entries({
    historical: options.classifications.historical,
    guardrail: options.classifications.guardrail,
    name_only_cleanup: options.classifications.nameOnlyCleanup,
    product_research: options.classifications.productResearch,
    active_unrelated: options.classifications.activeUnrelated,
  })) {
    for (const relativePath of Object.keys(rules)) {
      if (WILDCARD_PATTERN.test(relativePath)) {
        violations.push({
          code: "classification_wildcard_forbidden",
          relativePath,
          detail: classification,
        });
      }
    }
  }

  const sortedFiles = [...files].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  let scannedFileCount = 0;
  for (const file of sortedFiles) {
    scannedFileCount += 1;
    if (now() - startedAt > deadlineMs) {
      return timeoutReceipt(Math.ceil(now() - startedAt));
    }
    const hasRuntimeMarker = RETIRED_RUNTIME_PATTERN.test(file.content);
    const hasCopyMarker = RETIRED_COPY_PATTERN.test(file.content);
    const hasBuildMarker =
      file.surface === "build" && BUILD_RETIRED_PATTERN.test(file.content);
    const isBuiltNameOnlyCleanup = isSafeBuiltNameOnlyCleanup(file);
    const isExplicitlyClassified =
      options.classifications.guardrail[file.relativePath] !== undefined ||
      options.classifications.historical[file.relativePath] !== undefined ||
      options.classifications.nameOnlyCleanup[file.relativePath] !==
        undefined ||
      options.classifications.productResearch[file.relativePath] !==
        undefined ||
      options.classifications.activeUnrelated[file.relativePath] !==
        undefined ||
      isBuiltNameOnlyCleanup;
    if (
      !hasRuntimeMarker &&
      !hasCopyMarker &&
      !hasBuildMarker &&
      !isExplicitlyClassified
    ) {
      counts.active += 1;
      continue;
    }

    const guardrailReason =
      options.classifications.guardrail[file.relativePath];
    const historyReason = options.classifications.historical[file.relativePath];
    const cleanupReason =
      options.classifications.nameOnlyCleanup[file.relativePath];
    const productResearchReason =
      options.classifications.productResearch[file.relativePath];
    const activeUnrelatedReason =
      options.classifications.activeUnrelated[file.relativePath];
    let classification = "active_violation";

    if (cleanupReason !== undefined || isBuiltNameOnlyCleanup) {
      counts.name_only_cleanup += 1;
      classification = `cleanup:${cleanupReason ?? "built_exact_name_cleanup"}`;
      if (cleanupReason !== undefined) {
        violations.push(...validateNameOnlyCleanup(file));
      }
    } else if (guardrailReason !== undefined) {
      counts.guardrail += 1;
      classification = `guardrail:${guardrailReason}`;
    } else if (historyReason !== undefined) {
      counts.historical_provenance += 1;
      classification = `historical:${historyReason}`;
      if (!hasHistoricalSemanticFixture(file, historyReason)) {
        violations.push({
          code: "historical_semantic_fixture_missing",
          relativePath: file.relativePath,
        });
      }
    } else if (productResearchReason !== undefined) {
      counts.product_research += 1;
      classification = `product_research:${productResearchReason}`;
    } else if (activeUnrelatedReason !== undefined) {
      counts.active_unrelated += 1;
      classification = `active_unrelated:${activeUnrelatedReason}`;
    } else if (file.surface === "history") {
      violations.push({
        code: "unclassified_retired_history",
        relativePath: file.relativePath,
      });
    } else if (hasBuildMarker) {
      counts.build += 1;
      violations.push({
        code: "retired_build_output",
        relativePath: file.relativePath,
      });
    } else {
      counts.active += 1;
      if (hasRuntimeMarker) {
        violations.push({
          code: "active_retired_runtime",
          relativePath: file.relativePath,
        });
      }
      if (hasCopyMarker) {
        violations.push({
          code: "active_retired_copy",
          relativePath: file.relativePath,
        });
      }
    }

    matchedEvidence.push({
      relativePath: file.relativePath,
      surface: file.surface,
      classification,
      contentSha256: sha256(file.content),
    });
  }

  const sortedViolations = sortViolations(violations);
  const deterministicModel = {
    version: ONLINE_ONLY_RETIREMENT_VERSION,
    scannedFileCount,
    counts,
    matchedEvidence,
    violations: sortedViolations,
    buildOutputChecked: options.buildOutputChecked ?? false,
    checkedChunkCount: options.checkedChunkCount ?? 0,
    canonStatus: options.canonStatus ?? "not_checked",
  };
  const durationMs = Math.ceil(now() - startedAt);

  return {
    version: ONLINE_ONLY_RETIREMENT_VERSION,
    resultClass: sortedViolations.length === 0 ? "aligned" : "violations_found",
    failureClass:
      sortedViolations.length === 0 ? "none" : "classified_violation",
    scannedFileCount,
    matchedFileCount: matchedEvidence.length,
    activeViolationCount: sortedViolations.length,
    counts,
    buildOutputChecked: options.buildOutputChecked ?? false,
    checkedChunkCount: options.checkedChunkCount ?? 0,
    canonStatus: options.canonStatus ?? "not_checked",
    durationMs,
    digest: sha256(JSON.stringify(deterministicModel)),
    violations: sortedViolations,
    evidenceSafety: "counts_classes_paths_and_digests_only",
  };
}

export function validateRetirementPackageSurface(
  packageJsonText: string,
  lockfileText: string,
): RetirementViolation[] {
  const packageJson = JSON.parse(packageJsonText) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const directNames = Object.keys({
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
    ...(packageJson.optionalDependencies ?? {}),
  });
  const violations: RetirementViolation[] = [];
  for (const packageName of ["dexie", "fake-indexeddb"]) {
    if (directNames.includes(packageName)) {
      violations.push({
        code: "retired_direct_dependency",
        relativePath: "apps/web/package.json",
        detail: packageName,
      });
    }
    if (new RegExp(`^\\s{2}['\"]?${packageName}@`, "mu").test(lockfileText)) {
      violations.push({
        code: "retired_lock_dependency",
        relativePath: "apps/web/pnpm-lock.yaml",
        detail: packageName,
      });
    }
  }
  return violations;
}

export function validateOnlineOnlyMigrationSql(input: {
  bootstrapSql: string;
  migrationSql: string;
  immutableHistoricalSql: string;
}): RetirementViolation[] {
  const violations: RetirementViolation[] = [];
  if (/offline_entry_(?:queued|synced)/iu.test(input.bootstrapSql)) {
    violations.push({
      code: "bootstrap_retired_event_name",
      relativePath: "apps/web/sql/0001_walking_skeleton.sql",
    });
  }
  if (
    !/alter\s+table\s+analytics_events\s+drop\s+constraint(?:\s+if\s+exists)?\s+analytics_events_event_name_check/iu.test(
      input.migrationSql,
    )
  ) {
    violations.push({
      code: "migration_constraint_drop_missing",
      relativePath: "apps/web/sql/0035_online_only_retirement.sql",
    });
  }
  if (
    !/alter\s+table\s+analytics_events\s+add\s+constraint\s+analytics_events_event_name_check/iu.test(
      input.migrationSql,
    )
  ) {
    violations.push({
      code: "migration_constraint_add_missing",
      relativePath: "apps/web/sql/0035_online_only_retirement.sql",
    });
  }
  if (!/\bnot\s+valid\b/iu.test(input.migrationSql)) {
    violations.push({
      code: "migration_not_valid_missing",
      relativePath: "apps/web/sql/0035_online_only_retirement.sql",
    });
  }
  if (
    /(?:\bupdate\s+analytics_events\b|\bdelete\s+from\s+analytics_events\b|\binsert\s+into\s+analytics_events\b|\bvalidate\s+constraint\b)/iu.test(
      input.migrationSql,
    )
  ) {
    violations.push({
      code: "migration_row_mutation_forbidden",
      relativePath: "apps/web/sql/0035_online_only_retirement.sql",
    });
  }
  if (/offline_entry_(?:queued|synced)/iu.test(input.migrationSql)) {
    violations.push({
      code: "migration_retired_event_name",
      relativePath: "apps/web/sql/0035_online_only_retirement.sql",
    });
  }
  if (
    !/offline_entry_queued/iu.test(input.immutableHistoricalSql) ||
    !/offline_entry_synced/iu.test(input.immutableHistoricalSql)
  ) {
    violations.push({
      code: "immutable_history_retired_event_missing",
      relativePath: "apps/web/sql/0009_ove200_learning_actor_attributions.sql",
    });
  }
  return violations;
}

export async function runRetirementScanWithDeadline(input: {
  deadlineMs: number;
  scan: (signal: AbortSignal) => Promise<RetirementScanFile[]>;
  evaluate: (files: RetirementScanFile[]) => OnlineOnlyRetirementReceipt;
  onEvidence: (receipt: OnlineOnlyRetirementReceipt) => void;
}): Promise<OnlineOnlyRetirementReceipt> {
  const startedAt = performance.now();
  const deadlineMs = boundedDeadline(input.deadlineMs);
  const controller = new AbortController();
  let settled = false;
  let terminalReceipt: OnlineOnlyRetirementReceipt | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const finish = (receipt: OnlineOnlyRetirementReceipt) => {
    if (settled) return terminalReceipt ?? receipt;
    settled = true;
    terminalReceipt = receipt;
    if (timer !== undefined) clearTimeout(timer);
    input.onEvidence(receipt);
    return receipt;
  };

  const scanPromise = input
    .scan(controller.signal)
    .then((files) => {
      if (settled) return terminalReceipt ?? timeoutReceipt(input.deadlineMs);
      let elapsedMs = Math.ceil(performance.now() - startedAt);
      if (elapsedMs >= deadlineMs) {
        controller.abort();
        return finish(timeoutReceipt(elapsedMs));
      }
      const receipt = input.evaluate(files);
      elapsedMs = Math.ceil(performance.now() - startedAt);
      if (elapsedMs >= deadlineMs) {
        controller.abort();
        return finish(timeoutReceipt(elapsedMs));
      }
      return finish(receipt);
    })
    .catch((error: unknown) => {
      if (!settled) {
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        controller.abort();
      }
      throw error;
    });
  const timeoutPromise = new Promise<OnlineOnlyRetirementReceipt>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(finish(timeoutReceipt(Math.ceil(performance.now() - startedAt))));
    }, deadlineMs);
  });

  return Promise.race([scanPromise, timeoutPromise]);
}

const BUILT_IN_HISTORICAL_CLASSIFICATIONS: Readonly<Record<string, string>> = {
  "apps/web/sql/0009_ove200_learning_actor_attributions.sql":
    "immutable migration history for the original learning vocabulary",
  "docs/OFFLINE_RETIREMENT_PROVENANCE.md":
    "immutable historical provenance committed before enforcement",
  "docs/superpowers/plans/2026-08-21-ove-326-online-only-steady-state.md":
    "non-operative execution plan after closeout",
} as const;

const BUILT_IN_GUARDRAIL_CLASSIFICATIONS: Readonly<Record<string, string>> = {
  "apps/web/scripts/verify-online-only-retirement.ts":
    "OVE-326 negative source and build scanner",
  "apps/web/scripts/verify-online-only-retirement.test.ts":
    "OVE-326 negative scanner fixtures",
  "apps/web/scripts/smoke-online-only-product.ts":
    "OVE-326 redacted live absence smoke",
  "apps/web/scripts/smoke-offline-runtime-absence.ts":
    "OVE-323 redacted runtime-absence smoke",
  "apps/web/tests/online-only-product.spec.ts":
    "OVE-326 real-browser negative proof",
  "apps/web/tests/offline-runtime-absence.spec.ts":
    "OVE-323 returning-browser negative proof",
  "apps/web/src/lib/retirement/known-client-storage.test.ts":
    "exact-name cleanup negative fixtures",
  "apps/web/scripts/check-online-only-canon.ts":
    "binding online-only canon classifier",
  "apps/web/scripts/check-online-only-canon.test.ts":
    "binding online-only canon negative fixtures",
} as const;

const BUILT_IN_NAME_ONLY_CLEANUP_CLASSIFICATIONS: Readonly<
  Record<string, string>
> = {
  "apps/web/src/lib/retirement/known-client-storage.ts":
    "bounded exact-name returning-device deletion with control-state-only read",
} as const;

interface VerificationScanContext {
  files: RetirementScanFile[];
  classifications: RetirementClassifications;
  packageViolations: RetirementViolation[];
  migrationViolations: RetirementViolation[];
  buildOutputChecked: boolean;
  checkedChunkCount: number;
  canon: OnlineOnlyCanonReceipt;
}

export async function runOnlineOnlyRetirementVerification(
  input: {
    repositoryRoot?: string;
    requireBuildOutput?: boolean;
    proveDeterminism?: boolean;
    allowDirty?: boolean;
  } = {},
): Promise<OnlineOnlyRetirementReceipt> {
  const startedAt = performance.now();
  const repositoryRoot = input.repositoryRoot ?? resolveRepositoryRoot();
  const webRoot = path.join(repositoryRoot, "apps/web");
  let scanContext: VerificationScanContext | undefined;
  const first = await runRetirementScanWithDeadline({
    deadlineMs: ONLINE_ONLY_RETIREMENT_DEADLINE_MS,
    scan: async (signal) => {
      const context = await collectVerificationScanContext({
        repositoryRoot,
        webRoot,
        requireBuildOutput: input.requireBuildOutput ?? false,
        allowDirty: input.allowDirty ?? false,
        signal,
      });
      scanContext = context;
      return context.files;
    },
    evaluate: (files) => {
      const context = requiredScanContext(scanContext);
      return finalizeVerificationReceipt(
        evaluateOnlineOnlyRetirement(files, {
          classifications: context.classifications,
          buildOutputChecked: context.buildOutputChecked,
          checkedChunkCount: context.checkedChunkCount,
          canonStatus: context.canon.status,
        }),
        context,
      );
    },
    onEvidence: () => undefined,
  });
  if (first.resultClass === "degraded_timeout") return first;

  let elapsedMs = Math.ceil(performance.now() - startedAt);
  if (elapsedMs > ONLINE_ONLY_RETIREMENT_DEADLINE_MS) {
    return timeoutReceipt(elapsedMs);
  }
  const context = requiredScanContext(scanContext);

  if (input.proveDeterminism) {
    const second = finalizeVerificationReceipt(
      evaluateOnlineOnlyRetirement(context.files, {
        classifications: context.classifications,
        buildOutputChecked: context.buildOutputChecked,
        checkedChunkCount: context.checkedChunkCount,
        canonStatus: context.canon.status,
      }),
      context,
    );
    if (second.resultClass === "degraded_timeout") return second;
    if (first.digest !== second.digest) {
      throw new Error("Online-only retirement evidence is nondeterministic.");
    }
  }

  elapsedMs = Math.ceil(performance.now() - startedAt);
  if (elapsedMs > ONLINE_ONLY_RETIREMENT_DEADLINE_MS) {
    return timeoutReceipt(elapsedMs);
  }
  first.durationMs = elapsedMs;
  return first;
}

async function collectVerificationScanContext(input: {
  repositoryRoot: string;
  webRoot: string;
  requireBuildOutput: boolean;
  allowDirty: boolean;
  signal: AbortSignal;
}): Promise<VerificationScanContext> {
  throwIfScanAborted(input.signal);
  const manifest = JSON.parse(
    await readFile(
      path.join(
        input.repositoryRoot,
        "docs/ONLINE_ONLY_CANON_CLASSIFICATION.json",
      ),
      "utf8",
    ),
  ) as {
    historicalPaths?: string[];
    historicalPrefixes?: string[];
    requiredGuardrailPaths?: string[];
    productResearchPrefix?: string;
    activeUnrelatedRules?: Array<{
      path?: string;
      pathPrefix?: string;
      reason: string;
    }>;
  };
  throwIfScanAborted(input.signal);

  const trackedPaths = execFileSync("git", ["ls-files", "-z"], {
    cwd: input.repositoryRoot,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
    timeout: ONLINE_ONLY_RETIREMENT_DEADLINE_MS,
  })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
  throwIfScanAborted(input.signal);
  const classifications = buildRetirementClassifications(
    trackedPaths,
    manifest,
  );
  const trackedFiles = await readTrackedRetirementScanFiles({
    repositoryRoot: input.repositoryRoot,
    trackedPaths,
    classifications,
    signal: input.signal,
  });

  const [
    packageJsonText,
    lockfileText,
    bootstrapSql,
    migrationSql,
    historySql,
  ] = await Promise.all([
    readFile(path.join(input.webRoot, "package.json"), "utf8"),
    readFile(path.join(input.webRoot, "pnpm-lock.yaml"), "utf8"),
    readFile(path.join(input.webRoot, "sql/0001_walking_skeleton.sql"), "utf8"),
    readFile(
      path.join(input.webRoot, "sql/0035_online_only_retirement.sql"),
      "utf8",
    ),
    readFile(
      path.join(
        input.webRoot,
        "sql/0009_ove200_learning_actor_attributions.sql",
      ),
      "utf8",
    ),
  ]);
  throwIfScanAborted(input.signal);
  const packageViolations = validateRetirementPackageSurface(
    packageJsonText,
    lockfileText,
  );
  const migrationViolations = validateOnlineOnlyMigrationSql({
    bootstrapSql,
    migrationSql,
    immutableHistoricalSql: historySql,
  });
  const chunksRoot = path.join(input.webRoot, ".next/static/chunks");
  const buildOutputChecked = await exists(chunksRoot);
  if (input.requireBuildOutput && !buildOutputChecked) {
    throw new Error("A fresh production build is required for OVE-326 proof.");
  }
  const buildFiles = buildOutputChecked
    ? await readBuildChunks(chunksRoot, input.webRoot, input.signal)
    : [];
  throwIfScanAborted(input.signal);
  const canon = runOnlineOnlyCanonCheck({
    repositoryRoot: input.repositoryRoot,
    allowDirty: input.allowDirty,
    signal: input.signal,
  });
  throwIfScanAborted(input.signal);
  return {
    files: [...trackedFiles, ...buildFiles],
    classifications,
    packageViolations,
    migrationViolations,
    buildOutputChecked,
    checkedChunkCount: buildFiles.length,
    canon,
  };
}

export async function readTrackedRetirementScanFiles(input: {
  repositoryRoot: string;
  trackedPaths: readonly string[];
  classifications: RetirementClassifications;
  signal: AbortSignal;
  maxConcurrency?: number;
  readText?: (absolutePath: string) => Promise<string>;
}): Promise<RetirementScanFile[]> {
  const maxConcurrency =
    input.maxConcurrency ?? ONLINE_ONLY_RETIREMENT_READ_CONCURRENCY;
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error("Tracked-file read concurrency must be a positive integer.");
  }

  const relativePaths = input.trackedPaths
    .filter(isScannableTextPath)
    .toSorted((left, right) => left.localeCompare(right));
  const files = new Array<RetirementScanFile>(relativePaths.length);
  const readText =
    input.readText ??
    ((absolutePath: string) => readFile(absolutePath, "utf8"));
  let nextIndex = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(maxConcurrency, relativePaths.length) },
      async () => {
        while (true) {
          throwIfScanAborted(input.signal);
          const index = nextIndex;
          nextIndex += 1;
          const relativePath = relativePaths[index];
          if (relativePath === undefined) return;
          const content = await readText(
            path.join(input.repositoryRoot, relativePath),
          );
          throwIfScanAborted(input.signal);
          files[index] = {
            relativePath,
            content,
            surface: classifySurface(relativePath, input.classifications),
          };
        }
      },
    ),
  );

  return files;
}

function buildRetirementClassifications(
  trackedPaths: readonly string[],
  manifest: {
    historicalPaths?: string[];
    historicalPrefixes?: string[];
    requiredGuardrailPaths?: string[];
    productResearchPrefix?: string;
    activeUnrelatedRules?: Array<{
      path?: string;
      pathPrefix?: string;
      reason: string;
    }>;
  },
): RetirementClassifications {
  return {
    historical: exactRuleMap(
      [
        ...(manifest.historicalPaths ?? []),
        ...expandTrackedPrefixes(
          trackedPaths,
          manifest.historicalPrefixes ?? [],
        ),
      ],
      TRUSTED_CANON_HISTORY_REASON,
      BUILT_IN_HISTORICAL_CLASSIFICATIONS,
    ),
    guardrail: exactRuleMap(
      manifest.requiredGuardrailPaths ?? [],
      "online-only canon exact guardrail classification",
      BUILT_IN_GUARDRAIL_CLASSIFICATIONS,
    ),
    nameOnlyCleanup: BUILT_IN_NAME_ONLY_CLEANUP_CLASSIFICATIONS,
    productResearch: exactRuleMap(
      expandTrackedPrefixes(
        trackedPaths,
        manifest.productResearchPrefix ? [manifest.productResearchPrefix] : [],
      ),
      "online-only canon product research classification",
      {},
    ),
    activeUnrelated: expandActiveUnrelatedRules(
      trackedPaths,
      manifest.activeUnrelatedRules ?? [],
    ),
  };
}

function finalizeVerificationReceipt(
  receipt: OnlineOnlyRetirementReceipt,
  context: VerificationScanContext,
) {
  receipt.violations = sortViolations([
    ...receipt.violations,
    ...context.packageViolations,
    ...context.migrationViolations,
    ...(context.canon.status === "aligned"
      ? []
      : [
          {
            code: "active_retired_runtime" as const,
            relativePath: "docs/ONLINE_ONLY_CANON_CLASSIFICATION.json",
            detail: `canon_${context.canon.status}`,
          },
        ]),
  ]);
  receipt.activeViolationCount = receipt.violations.length;
  receipt.resultClass =
    receipt.violations.length === 0 ? "aligned" : "violations_found";
  receipt.failureClass =
    receipt.violations.length === 0 ? "none" : "classified_violation";
  receipt.digest = digestReceipt(receipt);
  return receipt;
}

function requiredScanContext(
  value: VerificationScanContext | undefined,
): VerificationScanContext {
  if (!value) throw new Error("Online-only scan context is unavailable.");
  return value;
}

function hasHistoricalSemanticFixture(
  file: RetirementScanFile,
  classificationReason: string,
) {
  if (HISTORICAL_SEMANTIC_PATTERN.test(file.content)) return true;
  if (classificationReason === TRUSTED_CANON_HISTORY_REASON) return true;
  return (
    file.relativePath ===
      "apps/web/sql/0009_ove200_learning_actor_attributions.sql" &&
    /OVE-200|learning actor attribution/iu.test(file.content)
  );
}

function validateNameOnlyCleanup(
  file: RetirementScanFile,
): RetirementViolation[] {
  const violations: RetirementViolation[] = [];
  const hasExactDeletion =
    /deleteDatabase\s*\(/u.test(file.content) &&
    /overgarden-(?:offline|control)/u.test(file.content);
  if (!hasExactDeletion) {
    violations.push({
      code: "cleanup_semantic_fixture_missing",
      relativePath: file.relativePath,
    });
  }
  const forbiddenStore = [
    ...file.content.matchAll(/objectStore\s*\(\s*["']([^"']+)["']/gu),
  ]
    .map((match) => match[1])
    .find((storeName) => storeName !== "vaults");
  const writesPayload =
    /objectStore\s*\([^)]*\)\s*\.\s*(?:add|put|delete|clear)\s*\(/u.test(
      file.content,
    );
  if (forbiddenStore !== undefined || writesPayload) {
    violations.push({
      code: "cleanup_payload_access_forbidden",
      relativePath: file.relativePath,
      detail: forbiddenStore ?? "object_store_write",
    });
  }
  return violations;
}

function isSafeBuiltNameOnlyCleanup(file: RetirementScanFile) {
  if (file.surface !== "build") return false;
  if (!/["']\/sw\.js["']/u.test(file.content)) return false;
  return (
    /getRegistrations/u.test(file.content) &&
    /\.unregister\s*\(/u.test(file.content) &&
    !/serviceWorker\.register\s*\(/u.test(file.content) &&
    !BUILD_RETIRED_PATTERN.test(file.content)
  );
}

function timeoutReceipt(durationMs: number): OnlineOnlyRetirementReceipt {
  const deterministicModel = {
    version: ONLINE_ONLY_RETIREMENT_VERSION,
    resultClass: "degraded_timeout",
    failureClass: "scan_timeout",
  };
  return {
    version: ONLINE_ONLY_RETIREMENT_VERSION,
    resultClass: "degraded_timeout",
    failureClass: "scan_timeout",
    scannedFileCount: 0,
    matchedFileCount: 0,
    activeViolationCount: 0,
    counts: emptyCounts(),
    buildOutputChecked: false,
    checkedChunkCount: 0,
    canonStatus: "not_checked",
    durationMs,
    digest: sha256(JSON.stringify(deterministicModel)),
    violations: [],
    evidenceSafety: "counts_classes_paths_and_digests_only",
  };
}

function exactRuleMap(
  paths: readonly string[],
  reason: string,
  extra: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries([
    ...paths.map((relativePath) => [relativePath, reason] as const),
    ...Object.entries(extra),
  ]);
}

function expandTrackedPrefixes(
  trackedPaths: readonly string[],
  prefixes: readonly string[],
) {
  return trackedPaths.filter((relativePath) =>
    prefixes.some((prefix) => relativePath.startsWith(prefix)),
  );
}

function expandActiveUnrelatedRules(
  trackedPaths: readonly string[],
  rules: readonly {
    path?: string;
    pathPrefix?: string;
    reason: string;
  }[],
) {
  const entries: Array<readonly [string, string]> = [];
  for (const rule of rules) {
    if (rule.path) entries.push([rule.path, rule.reason]);
    if (rule.pathPrefix) {
      for (const relativePath of trackedPaths) {
        if (relativePath.startsWith(rule.pathPrefix)) {
          entries.push([relativePath, rule.reason]);
        }
      }
    }
  }
  return Object.fromEntries(entries);
}

function classifySurface(
  relativePath: string,
  classifications: RetirementClassifications,
): RetirementSurface {
  if (classifications.nameOnlyCleanup[relativePath]) return "cleanup";
  if (classifications.guardrail[relativePath]) return "guardrail";
  if (classifications.historical[relativePath]) return "history";
  if (
    relativePath === "apps/web/package.json" ||
    relativePath.endsWith("lock.yaml")
  ) {
    return "package";
  }
  if (relativePath.startsWith("docs/")) return "document";
  return "source";
}

function isScannableTextPath(relativePath: string) {
  return /\.(?:css|js|json|md|mdx|mjs|sql|ts|tsx|txt|yaml|yml)$/iu.test(
    relativePath,
  );
}

async function readBuildChunks(
  root: string,
  webRoot: string,
  signal?: AbortSignal,
): Promise<RetirementScanFile[]> {
  throwIfScanAborted(signal);
  const entries = await readdir(root, { withFileTypes: true });
  throwIfScanAborted(signal);
  const files = await Promise.all(
    entries.map(async (entry): Promise<RetirementScanFile[]> => {
      throwIfScanAborted(signal);
      const absolutePath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return readBuildChunks(absolutePath, webRoot, signal);
      }
      if (!/\.js$/u.test(entry.name)) return [];
      const content = await readFile(absolutePath, "utf8");
      throwIfScanAborted(signal);
      return [
        {
          relativePath: path
            .join(
              ".next",
              path.relative(path.join(webRoot, ".next"), absolutePath),
            )
            .replaceAll(path.sep, "/"),
          content,
          surface: "build",
        },
      ];
    }),
  );
  return files
    .flat()
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function throwIfScanAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException(
      "Online-only retirement scan aborted.",
      "AbortError",
    );
  }
}

async function exists(absolutePath: string) {
  try {
    return (await stat(absolutePath)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function boundedDeadline(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(
    Math.max(Math.floor(value), 1),
    ONLINE_ONLY_RETIREMENT_DEADLINE_MS,
  );
}

function emptyCounts() {
  return {
    active: 0,
    guardrail: 0,
    historical_provenance: 0,
    name_only_cleanup: 0,
    product_research: 0,
    active_unrelated: 0,
    build: 0,
  };
}

function sortViolations(violations: readonly RetirementViolation[]) {
  return [...violations].sort((left, right) =>
    `${left.relativePath ?? ""}:${left.code}:${left.detail ?? ""}`.localeCompare(
      `${right.relativePath ?? ""}:${right.code}:${right.detail ?? ""}`,
    ),
  );
}

function digestReceipt(receipt: OnlineOnlyRetirementReceipt) {
  return sha256(
    JSON.stringify({
      version: receipt.version,
      resultClass: receipt.resultClass,
      failureClass: receipt.failureClass,
      scannedFileCount: receipt.scannedFileCount,
      matchedFileCount: receipt.matchedFileCount,
      activeViolationCount: receipt.activeViolationCount,
      counts: receipt.counts,
      buildOutputChecked: receipt.buildOutputChecked,
      checkedChunkCount: receipt.checkedChunkCount,
      canonStatus: receipt.canonStatus,
      violations: receipt.violations,
      evidenceSafety: receipt.evidenceSafety,
    }),
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function resolveRepositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function isDirectExecution() {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

function parseArguments(arguments_: readonly string[]) {
  const normalized = arguments_.filter((argument) => argument !== "--");
  const allowed = new Set(["--require-build-output", "--prove-determinism"]);
  for (const argument of normalized) {
    if (!allowed.has(argument))
      throw new Error(`Unknown argument: ${argument}`);
  }
  return {
    requireBuildOutput: normalized.includes("--require-build-output"),
    proveDeterminism: normalized.includes("--prove-determinism"),
  };
}

if (isDirectExecution()) {
  runOnlineOnlyRetirementVerification(parseArguments(process.argv.slice(2)))
    .then((receipt) => {
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
      if (receipt.resultClass !== "aligned") process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({
          version: ONLINE_ONLY_RETIREMENT_VERSION,
          resultClass: "failed",
          failureClass:
            error instanceof Error
              ? error.message
              : "unknown_verification_error",
          evidenceSafety: "no_identity_content_or_secret",
        })}\n`,
      );
      process.exitCode = 1;
    });
}
