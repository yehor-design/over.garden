import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ONLINE_ONLY_CANON_VERSION = "ove320.onlineOnlyCanon.v1";
export const ONLINE_ONLY_CANON_DEADLINE_MS = 5_000;

export const ONLINE_ONLY_TERM_SOURCE =
  "offline|PWA|Dexie|IndexedDB|service.?worker|local.?draft|queued|synced|no.?internet|офлайн|оффлайн|офлайн-захоплення|локальна черга|блекаут|блэкаут|без інтернет|без интернет";

export const ONLINE_ONLY_CLASSES = [
  "active_forbidden",
  "active_required_guardrail",
  "historical_provenance",
  "product_research",
  "active_unrelated",
  "runtime_pending_child",
] as const;

export type OnlineOnlyClassification = (typeof ONLINE_ONLY_CLASSES)[number];
export type OnlineOnlyScope = "all" | "phase-a" | "phase-b";

interface RuntimeRule {
  path?: string;
  pathPrefix?: string;
  owner: "OVE-321" | "OVE-322" | "OVE-323";
  reason: string;
}

interface ActiveUnrelatedRule {
  path?: string;
  pathPrefix?: string;
  reason: string;
}

export interface OnlineOnlyClassificationManifest {
  version: typeof ONLINE_ONLY_CANON_VERSION;
  evidenceBaselineSha: string;
  evidenceV1: {
    command: string;
    matchingTrackedFiles: number;
    offlineMatchingTrackedFiles: number;
  };
  scope: {
    phaseA: string[];
    phaseB: string[];
  };
  activeAuthorityPaths: string[];
  requiredGuardrailPaths?: string[];
  historicalPaths: string[];
  historicalPrefixes: string[];
  productResearchPrefix: string;
  runtimeRules: RuntimeRule[];
  activeUnrelatedRules: ActiveUnrelatedRule[];
  ownerStates: Record<"OVE-321" | "OVE-322" | "OVE-323", string>;
}

export interface OnlineOnlyClassificationEntry {
  path: string;
  anchor: string;
  class: OnlineOnlyClassification;
  reason: string;
  owner?: "OVE-321" | "OVE-322" | "OVE-323";
}

export interface OnlineOnlyCanonViolation {
  code: string;
  path?: string;
  anchor?: string;
  owner?: string;
}

export interface OnlineOnlyCanonReceipt {
  version: typeof ONLINE_ONLY_CANON_VERSION;
  status: "aligned" | "canon_drift" | "timed_out" | "cancelled";
  baselineSha: string;
  scope: OnlineOnlyScope;
  scannedTrackedFiles: number;
  matchingSpans: number;
  counts: Record<OnlineOnlyClassification, number>;
  entries: OnlineOnlyClassificationEntry[];
  durationMs: number;
  digest: string;
  violations: OnlineOnlyCanonViolation[];
}

interface CandidateSpan {
  path: string;
  anchor: string;
  heading: string;
  content: string;
}

interface EvaluateOptions {
  manifest: OnlineOnlyClassificationManifest;
  baselineSha?: string;
  scope?: OnlineOnlyScope;
  deadlineMs?: number;
  now?: () => number;
  signal?: AbortSignal;
  stableTree?: boolean;
  strictConsumers?: boolean;
}

const REQUIRED_CURRENT_CONSUMERS = [
  "AGENTS.md",
  "README.md",
  "apps/web/README.md",
  "docs/adr/ADR-0017-online-only-product.md",
  "docs/TECH_STACK_DECISIONS.md",
  "docs/MVP_SCOPE_RECHECK_2026-07-03.md",
  "docs/SDD_VERTICAL_SLICE_ROADMAP.md",
  "docs/SCAFFOLD_STATUS.md",
  "docs/WALKING_SKELETON.md",
  "docs/OFFLINE_OWNER_VAULT.md",
  "docs/OFFLINE_WORKSPACE_SUMMARY_CONTRACT.md",
  "docs/adr/ADR-0014-agentic-stack-realignment.md",
  "docs/adr/ADR-0015-lexical-structured-journal-editor.md",
  "docs/MIGRATION_ALLOCATION.md",
  "docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md",
  "docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md",
  "docs/CURRENT_SCHEMA_ERASURE.md",
  "docs/DRIVE2_PARITY_PRODUCTION_CLOSEOUT.md",
  "docs/VISUAL_FIXTURE_ENVIRONMENT.md",
  "docs/PRODUCTION_PILOT_SMOKE.md",
  "docs/product-research/README.md",
  "docs/LOCALIZATION_COVERAGE_BASELINE_2026-07-14.md",
  "apps/web/scripts/check-linear-agent-task.ts",
  "apps/web/scripts/check-linear-agent-task.test.ts",
  "apps/web/package.json",
  ".github/workflows/ci.yml",
  "apps/web/src/lib/garden/use-online-journal-composer.ts",
  "apps/web/src/lib/retirement/known-client-storage.ts",
  "apps/web/src/app/garden/first-entry-composer.tsx",
  "apps/web/src/app/garden/space-entry-composer.tsx",
  "apps/web/src/app/garden/objects/[objectId]/follow-up-entry-composer.tsx",
  "apps/web/src/app/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
] as const;

export function evaluateOnlineOnlyCanon(
  files: Readonly<Record<string, string>>,
  options: EvaluateOptions,
): OnlineOnlyCanonReceipt {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const deadlineMs = options.deadlineMs ?? ONLINE_ONLY_CANON_DEADLINE_MS;
  const baselineSha =
    options.baselineSha ?? options.manifest.evidenceBaselineSha;
  const scope = options.scope ?? "all";
  const violations: OnlineOnlyCanonViolation[] = [];

  if (options.signal?.aborted) {
    return terminalReceipt({
      status: "cancelled",
      baselineSha,
      scope,
      scannedTrackedFiles: 0,
      durationMs: Math.ceil(now() - startedAt),
      violations: [{ code: "scan_cancelled" }],
    });
  }

  if (options.manifest.version !== ONLINE_ONLY_CANON_VERSION) {
    violations.push({ code: "manifest_version_drift" });
  }
  if (!/^[a-f0-9]{40}$/.test(baselineSha)) {
    violations.push({ code: "invalid_baseline_sha" });
  }
  if (options.stableTree === false) {
    violations.push({ code: "changing_proof_baseline" });
  }
  violations.push(...findDuplicateRules(options.manifest));

  const scopedFiles = Object.entries(files)
    .filter(([relativePath]) => pathBelongsToScope(relativePath, scope))
    .sort(([left], [right]) => left.localeCompare(right));
  const entries: OnlineOnlyClassificationEntry[] = [];

  for (const [relativePath, content] of scopedFiles) {
    if (options.signal?.aborted) {
      return terminalReceipt({
        status: "cancelled",
        baselineSha,
        scope,
        scannedTrackedFiles: entries.length,
        durationMs: Math.ceil(now() - startedAt),
        violations: [{ code: "scan_cancelled" }],
      });
    }
    if (now() - startedAt > deadlineMs) {
      return terminalReceipt({
        status: "timed_out",
        baselineSha,
        scope,
        scannedTrackedFiles: entries.length,
        durationMs: Math.ceil(now() - startedAt),
        violations: [{ code: "tracked_file_read_timeout" }],
      });
    }

    for (const span of extractCandidateSpans(relativePath, content)) {
      const entry = classifyCandidate(span, options.manifest);
      entries.push(entry);
      if (entry.class === "active_forbidden") {
        violations.push({
          code: "active_offline_instruction",
          path: entry.path,
          anchor: entry.anchor,
        });
      }
      if (
        entry.class === "runtime_pending_child" &&
        entry.owner !== undefined &&
        isTerminalState(options.manifest.ownerStates[entry.owner])
      ) {
        violations.push({
          code: "terminal_runtime_owner",
          path: entry.path,
          anchor: entry.anchor,
          owner: entry.owner,
        });
      }
    }
  }

  if (options.strictConsumers) {
    violations.push(...validateCurrentConsumers(files));
  }

  entries.sort((left, right) => entryKey(left).localeCompare(entryKey(right)));
  violations.sort((left, right) =>
    violationKey(left).localeCompare(violationKey(right)),
  );
  const counts = emptyCounts();
  for (const entry of entries) counts[entry.class] += 1;

  return {
    version: ONLINE_ONLY_CANON_VERSION,
    status: violations.length === 0 ? "aligned" : "canon_drift",
    baselineSha,
    scope,
    scannedTrackedFiles: scopedFiles.length,
    matchingSpans: entries.length,
    counts,
    entries,
    durationMs: Math.ceil(now() - startedAt),
    digest: digestClassification(files, options.manifest, entries),
    violations,
  };
}

export function runOnlineOnlyCanonCheck(
  options: {
    repositoryRoot?: string;
    baselineSha?: string;
    scope?: OnlineOnlyScope;
    injectReadTimeout?: boolean;
    signal?: AbortSignal;
    allowDirty?: boolean;
  } = {},
): OnlineOnlyCanonReceipt {
  const repositoryRoot = options.repositoryRoot ?? resolveRepositoryRoot();
  const manifest = readManifest(repositoryRoot);
  const before = readTreeIdentity(repositoryRoot);
  const files = readTrackedTextFiles(repositoryRoot);
  const after = readTreeIdentity(repositoryRoot);
  const stableTree =
    before.head === after.head &&
    before.trackedDigest === after.trackedDigest &&
    (options.allowDirty === true || before.dirty === false);

  if (options.injectReadTimeout) {
    let call = 0;
    return evaluateOnlineOnlyCanon(files, {
      manifest,
      baselineSha: options.baselineSha,
      scope: options.scope,
      deadlineMs: 1,
      now: () => (call++ === 0 ? 0 : 2),
      signal: options.signal,
      stableTree,
      strictConsumers: true,
    });
  }

  return evaluateOnlineOnlyCanon(files, {
    manifest,
    baselineSha: options.baselineSha,
    scope: options.scope,
    signal: options.signal,
    stableTree,
    strictConsumers: true,
  });
}

export function formatOnlineOnlyCanonReceipt(
  receipt: OnlineOnlyCanonReceipt,
): string {
  return JSON.stringify({
    version: receipt.version,
    status: receipt.status,
    baselineSha: receipt.baselineSha,
    scope: receipt.scope,
    scannedTrackedFiles: receipt.scannedTrackedFiles,
    matchingSpans: receipt.matchingSpans,
    counts: receipt.counts,
    durationMs: receipt.durationMs,
    digest: receipt.digest,
    violations: receipt.violations,
  });
}

export function parseOnlineOnlyCanonArguments(arguments_: readonly string[]): {
  baselineSha?: string;
  scope: OnlineOnlyScope;
  proveDeterminism: boolean;
  injectReadTimeout: boolean;
} {
  const normalized = arguments_.filter((argument) => argument !== "--");
  let baselineSha: string | undefined;
  let scope: OnlineOnlyScope = "all";
  let proveDeterminism = false;
  let injectReadTimeout = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const argument = normalized[index];
    if (argument === "--baseline") {
      const value = normalized[index + 1];
      if (value === undefined || !/^[a-f0-9]{40}$/.test(value)) {
        throw new Error("invalid_baseline_sha");
      }
      baselineSha = value;
      index += 1;
      continue;
    }
    if (argument === "--scope") {
      const value = normalized[index + 1];
      if (value !== "all" && value !== "phase-a" && value !== "phase-b") {
        throw new Error("invalid_scope");
      }
      scope = value;
      index += 1;
      continue;
    }
    if (argument === "--prove-determinism") {
      proveDeterminism = true;
      continue;
    }
    if (argument === "--inject-read-timeout") {
      injectReadTimeout = true;
      continue;
    }
    throw new Error("unknown_argument");
  }

  return { baselineSha, scope, proveDeterminism, injectReadTimeout };
}

function extractCandidateSpans(
  relativePath: string,
  content: string,
): CandidateSpan[] {
  const termPattern = new RegExp(ONLINE_ONLY_TERM_SOURCE, "i");
  if (!termPattern.test(content)) return [];
  const lines = content.split(/\r?\n/);
  if (!/\.(?:md|mdx|txt)$/i.test(relativePath)) {
    return lines.flatMap((line, index) =>
      termPattern.test(line)
        ? [
            {
              path: relativePath,
              anchor: `lines ${index + 1}-${index + 1}`,
              heading: "",
              content: line,
            },
          ]
        : [],
    );
  }

  const spans: CandidateSpan[] = [];
  let heading = "";
  let paragraph: string[] = [];
  let paragraphStart = 1;

  const flush = (endLine: number) => {
    const paragraphContent = paragraph.join("\n");
    if (termPattern.test(paragraphContent)) {
      spans.push({
        path: relativePath,
        anchor: heading || `lines ${paragraphStart}-${endLine}`,
        heading,
        content: paragraphContent,
      });
    }
    paragraph = [];
  };

  lines.forEach((line, index) => {
    const headingMatch = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      if (paragraph.length > 0) flush(index);
      heading = headingMatch[1].replace(/[*_`]/g, "");
      paragraphStart = index + 2;
      return;
    }
    if (line.trim() === "") {
      if (paragraph.length > 0) flush(index);
      paragraphStart = index + 2;
      return;
    }
    if (paragraph.length === 0) paragraphStart = index + 1;
    paragraph.push(line);
  });
  if (paragraph.length > 0) flush(lines.length);
  return spans;
}

function classifyCandidate(
  span: CandidateSpan,
  manifest: OnlineOnlyClassificationManifest,
): OnlineOnlyClassificationEntry {
  if (isDatedReceipt(span.content)) {
    return entry(span, "historical_provenance", "dated_receipt");
  }
  if (isActiveGate(span.heading) && isImperative(span.content)) {
    return entry(span, "active_forbidden", "active_gate_instruction");
  }
  if (
    manifest.historicalPaths.includes(span.path) ||
    manifest.historicalPrefixes.some((prefix) => span.path.startsWith(prefix))
  ) {
    return entry(span, "historical_provenance", "historical_path");
  }
  if (span.path.startsWith(manifest.productResearchPrefix)) {
    return entry(span, "product_research", "research_record");
  }
  if (manifest.activeAuthorityPaths.includes(span.path)) {
    return isGuardrail(span.content)
      ? entry(span, "active_required_guardrail", "online_only_guardrail")
      : entry(span, "active_forbidden", "active_authority_contradiction");
  }
  if (manifest.requiredGuardrailPaths?.includes(span.path)) {
    return entry(span, "active_required_guardrail", "canon_enforcement");
  }
  const unrelatedRule = manifest.activeUnrelatedRules.find((rule) =>
    matchesRule(span.path, rule),
  );
  if (unrelatedRule) {
    return entry(
      span,
      "active_unrelated",
      normalizeReason(unrelatedRule.reason),
    );
  }
  const runtimeRule = manifest.runtimeRules.find((rule) =>
    matchesRule(span.path, rule),
  );
  if (runtimeRule) {
    return {
      ...entry(
        span,
        "runtime_pending_child",
        normalizeReason(runtimeRule.reason),
      ),
      owner: runtimeRule.owner,
    };
  }
  return entry(span, "active_forbidden", "unclassified_active_match");
}

function validateCurrentConsumers(
  files: Readonly<Record<string, string>>,
): OnlineOnlyCanonViolation[] {
  const violations: OnlineOnlyCanonViolation[] = [];
  for (const relativePath of REQUIRED_CURRENT_CONSUMERS) {
    if (files[relativePath] === undefined) {
      violations.push({
        code: "missing_required_consumer",
        path: relativePath,
      });
    }
  }
  const requireTerms = (
    relativePath: string,
    terms: readonly (string | RegExp)[],
    code: string,
  ) => {
    const content = files[relativePath];
    if (
      content !== undefined &&
      terms.some((term) =>
        typeof term === "string"
          ? !content.includes(term)
          : !term.test(content),
      )
    ) {
      violations.push({ code, path: relativePath });
    }
  };

  for (const relativePath of [
    "AGENTS.md",
    "README.md",
    "apps/web/README.md",
    "docs/TECH_STACK_DECISIONS.md",
    "docs/MVP_SCOPE_RECHECK_2026-07-03.md",
    "docs/SDD_VERTICAL_SLICE_ROADMAP.md",
    "docs/SCAFFOLD_STATUS.md",
    "docs/WALKING_SKELETON.md",
  ]) {
    requireTerms(
      relativePath,
      ["ADR-0017", /network-required|online-only/i],
      "missing_online_only_authority",
    );
  }
  requireTerms(
    "docs/adr/ADR-0017-online-only-product.md",
    [
      "Blackout exposure after offline retirement",
      "navigator.onLine",
      "never-returning",
      "OVE-321",
      "OVE-322",
      "OVE-323",
      "OVE-324",
      "OVE-325",
      "OVE-326",
      /irreversible|one-way/i,
      /no new durable browser journal/i,
    ],
    "adr0017_contract_drift",
  );
  requireMinimumOccurrences(
    files,
    "docs/adr/ADR-0014-agentic-stack-realignment.md",
    "ADR-0017",
    3,
    "adr0014_superseding_pointer_drift",
    violations,
  );
  requireMinimumOccurrences(
    files,
    "docs/adr/ADR-0015-lexical-structured-journal-editor.md",
    "ADR-0017",
    4,
    "adr0015_superseding_pointer_drift",
    violations,
  );
  requireMinimumOccurrences(
    files,
    "docs/TECH_STACK_DECISIONS.md",
    "ADR-0017",
    4,
    "stack_superseding_pointer_drift",
    violations,
  );
  for (const relativePath of [
    "docs/OFFLINE_OWNER_VAULT.md",
    "docs/OFFLINE_WORKSPACE_SUMMARY_CONTRACT.md",
  ]) {
    requireTerms(
      relativePath,
      ["ADR-0017", /historical|non-operative|superseded/i],
      "legacy_contract_pointer_drift",
    );
  }
  requireTerms(
    "docs/MIGRATION_ALLOCATION.md",
    [/0029[^\n]*OVE-321/, /0030[^\n]*OVE-322/],
    "migration_allocation_drift",
  );
  requireTerms(
    "docs/CURRENT_SCHEMA_ERASURE.md",
    ["OVE-323", /name-only|known-client-storage/i],
    "erasure_successor_drift",
  );
  for (const relativePath of [
    "docs/DRIVE2_PARITY_PRODUCTION_CLOSEOUT.md",
    "docs/PRODUCTION_PILOT_SMOKE.md",
  ]) {
    requireTerms(
      relativePath,
      ["network_unavailable_save_refused", "OVE-323"],
      "operator_gate_successor_drift",
    );
  }
  requireTerms(
    "docs/VISUAL_FIXTURE_ENVIRONMENT.md",
    ["connection_required", "OVE-323"],
    "operator_gate_successor_drift",
  );
  requireTerms(
    "docs/product-research/README.md",
    ["ADR-0017", /root.*TECH_STACK_DECISIONS|TECH_STACK_DECISIONS.*root/i],
    "research_routing_drift",
  );
  requireTerms(
    "docs/LOCALIZATION_COVERAGE_BASELINE_2026-07-14.md",
    ["OVE-323", /leaves the coverage input set/i],
    "localization_input_drift",
  );
  requireTerms(
    "docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md",
    ["local-retirement", /network-required/i, /read-only retirement bridge/i],
    "task_standard_retirement_drift",
  );
  requireTerms(
    "docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md",
    ["local-retirement"],
    "task_template_retirement_drift",
  );
  for (const relativePath of [
    "apps/web/scripts/check-linear-agent-task.ts",
    "apps/web/scripts/check-linear-agent-task.test.ts",
  ]) {
    requireTerms(
      relativePath,
      ["local-retirement"],
      "task_validator_retirement_drift",
    );
  }
  requireTerms(
    "apps/web/package.json",
    ["online-only:canon:check"],
    "missing_package_command",
  );
  requireTerms(
    ".github/workflows/ci.yml",
    ["online-only:canon:check", "linear:task:standard:check"],
    "missing_ci_enforcement",
  );
  violations.push(...validateOnlineComposerCutover(files));
  return violations;
}

const ATOMIC_LOCAL_CREATE_COMPOSER_PATHS = [
  "apps/web/src/app/garden/first-entry-composer.tsx",
  "apps/web/src/app/garden/space-entry-composer.tsx",
  "apps/web/src/app/garden/objects/[objectId]/follow-up-entry-composer.tsx",
] as const;

const ONLINE_EDIT_COMPOSER_PATHS = [
  "apps/web/src/app/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
] as const;

const ONLINE_AUTHORING_CALLER_PATHS = [
  ...ATOMIC_LOCAL_CREATE_COMPOSER_PATHS,
  ...ONLINE_EDIT_COMPOSER_PATHS,
  "apps/web/src/app/garden/server-draft-resume-panel.tsx",
  "apps/web/src/app/garden/garden-workspace-service-state.tsx",
  "apps/web/src/app/garden/garden-workspace-view.tsx",
  "apps/web/src/components/garden/journal-cover-controls.tsx",
  "apps/web/src/lib/garden/composer-photo-selection.ts",
  "apps/web/src/lib/garden/local-journal-media-coordinator.ts",
  "apps/web/src/lib/garden/use-local-journal-composer.ts",
  "apps/web/src/lib/garden/use-inline-media-selection.ts",
] as const;

function validateOnlineComposerCutover(
  files: Readonly<Record<string, string>>,
): OnlineOnlyCanonViolation[] {
  const violations: OnlineOnlyCanonViolation[] = [];
  const offlineImport =
    /(?:from\s*|import\s*\(\s*)["'][^"']*(?:@\/lib\/offline|\/offline\/)[^"']*["']/u;

  for (const [relativePath, content] of Object.entries(files)) {
    if (
      !relativePath.startsWith("apps/web/src/") ||
      /(?:\.test|\.spec)\.[cm]?[jt]sx?$/u.test(relativePath)
    ) {
      continue;
    }
    if (offlineImport.test(content)) {
      violations.push({
        code: "legacy_offline_import",
        path: relativePath,
      });
    }
  }

  for (const relativePath of Object.keys(files)) {
    if (
      relativePath.startsWith("apps/web/src/lib/offline/") ||
      relativePath.startsWith("apps/web/src/lib/legacy-device-work/") ||
      relativePath.startsWith("apps/web/src/app/api/offline/") ||
      relativePath === "apps/web/src/app/manifest.ts" ||
      relativePath === "apps/web/src/app/sw-register.tsx" ||
      relativePath === "apps/web/public/sw.js"
    ) {
      violations.push({
        code: "retired_runtime_path_present",
        path: relativePath,
      });
    }
  }

  for (const relativePath of ATOMIC_LOCAL_CREATE_COMPOSER_PATHS) {
    const content = files[relativePath] ?? "";
    if (
      !content.includes("useLocalJournalComposer({") ||
      !content.includes("LocalJournalComposerStatus") ||
      content.includes("useOnlineJournalComposer({")
    ) {
      violations.push({
        code: "composer_atomic_local_owner_missing",
        path: relativePath,
      });
    }
  }

  for (const relativePath of ONLINE_EDIT_COMPOSER_PATHS) {
    const content = files[relativePath] ?? "";
    if (
      !content.includes("useOnlineJournalComposer({") ||
      !content.includes("OnlineJournalComposerStatus")
    ) {
      violations.push({
        code: "composer_server_draft_owner_missing",
        path: relativePath,
      });
    }
  }

  for (const relativePath of ONLINE_AUTHORING_CALLER_PATHS) {
    const content = files[relativePath] ?? "";
    if (
      /navigator\.onLine|addEventListener\(\s*["'](?:online|offline)["']|indexedDB|localStorage|sessionStorage|navigator\.serviceWorker|caches\.(?:open|put|add|addAll)/u.test(
        content,
      )
    ) {
      violations.push({
        code: "active_composer_browser_durability_or_connectivity_authority",
        path: relativePath,
      });
    }
  }

  return violations;
}

function requireMinimumOccurrences(
  files: Readonly<Record<string, string>>,
  relativePath: string,
  needle: string,
  minimum: number,
  code: string,
  violations: OnlineOnlyCanonViolation[],
) {
  const content = files[relativePath];
  if (content === undefined) return;
  const count = content.split(needle).length - 1;
  if (count < minimum) violations.push({ code, path: relativePath });
}

function readManifest(
  repositoryRoot: string,
): OnlineOnlyClassificationManifest {
  const relativePath = "docs/ONLINE_ONLY_CANON_CLASSIFICATION.json";
  const manifest = JSON.parse(
    readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
  ) as OnlineOnlyClassificationManifest;
  return manifest;
}

function readTrackedTextFiles(repositoryRoot: string): Record<string, string> {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "buffer",
    timeout: ONLINE_ONLY_CANON_DEADLINE_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  const relativePaths = output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
  for (const requiredPath of [
    ...REQUIRED_CURRENT_CONSUMERS,
    "docs/ONLINE_ONLY_CANON_CLASSIFICATION.json",
  ]) {
    if (!relativePaths.includes(requiredPath)) relativePaths.push(requiredPath);
  }
  relativePaths.sort();
  const files: Record<string, string> = {};
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    let bytes: Buffer;
    try {
      bytes = readFileSync(absolutePath);
    } catch {
      continue;
    }
    if (bytes.includes(0)) continue;
    files[relativePath] = bytes.toString("utf8");
  }
  return files;
}

function readTreeIdentity(repositoryRoot: string): {
  head: string;
  trackedDigest: string;
  dirty: boolean;
} {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: ONLINE_ONLY_CANON_DEADLINE_MS,
  }).trim();
  const tracked = execFileSync("git", ["ls-files", "-s", "-z"], {
    cwd: repositoryRoot,
    encoding: "buffer",
    timeout: ONLINE_ONLY_CANON_DEADLINE_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  const status = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: ONLINE_ONLY_CANON_DEADLINE_MS,
    },
  );
  return {
    head,
    trackedDigest: createHash("sha256").update(tracked).digest("hex"),
    dirty: status.trim().length > 0,
  };
}

function findDuplicateRules(
  manifest: OnlineOnlyClassificationManifest,
): OnlineOnlyCanonViolation[] {
  const keys = [
    ...manifest.runtimeRules.map((rule) => `runtime:${JSON.stringify(rule)}`),
    ...manifest.activeUnrelatedRules.map(
      (rule) => `unrelated:${JSON.stringify(rule)}`,
    ),
  ];
  const seen = new Set<string>();
  return keys.flatMap((key) => {
    if (seen.has(key)) return [{ code: "duplicate_manifest_rule" }];
    seen.add(key);
    return [];
  });
}

function terminalReceipt(input: {
  status: "timed_out" | "cancelled";
  baselineSha: string;
  scope: OnlineOnlyScope;
  scannedTrackedFiles: number;
  durationMs: number;
  violations: OnlineOnlyCanonViolation[];
}): OnlineOnlyCanonReceipt {
  return {
    version: ONLINE_ONLY_CANON_VERSION,
    status: input.status,
    baselineSha: input.baselineSha,
    scope: input.scope,
    scannedTrackedFiles: input.scannedTrackedFiles,
    matchingSpans: 0,
    counts: emptyCounts(),
    entries: [],
    durationMs: input.durationMs,
    digest: createHash("sha256").update(input.status).digest("hex"),
    violations: input.violations,
  };
}

function digestClassification(
  files: Readonly<Record<string, string>>,
  manifest: OnlineOnlyClassificationManifest,
  entries: readonly OnlineOnlyClassificationEntry[],
): string {
  const contentDigests = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relativePath, content]) => [
      relativePath,
      createHash("sha256").update(content).digest("hex"),
    ]);
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: manifest.version,
        evidenceBaselineSha: manifest.evidenceBaselineSha,
        contentDigests,
        entries,
      }),
    )
    .digest("hex");
}

function emptyCounts(): Record<OnlineOnlyClassification, number> {
  return {
    active_forbidden: 0,
    active_required_guardrail: 0,
    historical_provenance: 0,
    product_research: 0,
    active_unrelated: 0,
    runtime_pending_child: 0,
  };
}

function entry(
  span: CandidateSpan,
  classification: OnlineOnlyClassification,
  reason: string,
): OnlineOnlyClassificationEntry {
  return {
    path: span.path,
    anchor: span.anchor,
    class: classification,
    reason,
  };
}

function matchesRule(
  relativePath: string,
  rule: { path?: string; pathPrefix?: string },
): boolean {
  return (
    rule.path === relativePath ||
    (rule.pathPrefix !== undefined && relativePath.startsWith(rule.pathPrefix))
  );
}

function isDatedReceipt(content: string): boolean {
  return (
    /Implementation status \(\d{4}-\d{2}-\d{2}\)/i.test(content) ||
    /\|\s*\d{4}-\d{2}-\d{2}[^\n]*\|/.test(content)
  );
}

function isActiveGate(heading: string): boolean {
  return /^(?:active|failure|release|operator) gate/i.test(heading);
}

function isImperative(content: string): boolean {
  return /(?:^|\n)\s*(?:keep|store|save|use|enable|retain|persist|queue|cache|install|зберігайте|збережіть|використовуйте|увімкніть|сохраняйте|используйте)(?=\s|[.!?:;]|$)/imu.test(
    content,
  );
}

function isGuardrail(content: string): boolean {
  return /forbid|must not|never|no new|non-operative|supersed|historical|retir|removed|leaves the coverage input set|network-required|online-only|re-pinned|not (?:an? )?(?:offline|pwa)|without (?:an? )?(?:offline|pwa)/i.test(
    content,
  );
}

function isTerminalState(state: string): boolean {
  return /^(?:done|completed|canceled|cancelled)$/i.test(state.trim());
}

function pathBelongsToScope(
  relativePath: string,
  scope: OnlineOnlyScope,
): boolean {
  if (scope === "all") return true;
  const isPhaseB =
    relativePath.startsWith("apps/web/src/") ||
    relativePath.startsWith("apps/web/public/") ||
    relativePath === "apps/web/next.config.ts" ||
    relativePath === "apps/web/package.json" ||
    relativePath === "apps/web/pnpm-lock.yaml";
  return scope === "phase-b" ? isPhaseB : !isPhaseB;
}

function normalizeReason(reason: string): string {
  return reason
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function entryKey(entry_: OnlineOnlyClassificationEntry): string {
  return `${entry_.path}:${entry_.anchor}:${entry_.class}:${entry_.owner ?? ""}`;
}

function violationKey(violation: OnlineOnlyCanonViolation): string {
  return `${violation.path ?? ""}:${violation.anchor ?? ""}:${violation.code}:${violation.owner ?? ""}`;
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

if (isDirectExecution()) {
  try {
    const arguments_ = parseOnlineOnlyCanonArguments(process.argv.slice(2));
    const options = {
      baselineSha: arguments_.baselineSha,
      scope: arguments_.scope,
      injectReadTimeout: arguments_.injectReadTimeout,
    };
    const first = runOnlineOnlyCanonCheck(options);
    if (arguments_.proveDeterminism) {
      const second = runOnlineOnlyCanonCheck(options);
      if (first.digest !== second.digest || first.status !== second.status) {
        first.status = "canon_drift";
        first.violations.push({ code: "nondeterministic_classification" });
      }
    }
    process.stdout.write(`${formatOnlineOnlyCanonReceipt(first)}\n`);
    if (first.status !== "aligned") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: "failed",
        reason: error instanceof Error ? error.message : "invalid_arguments",
      })}\n`,
    );
    process.exitCode = 1;
  }
}
