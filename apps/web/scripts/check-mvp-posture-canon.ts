import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MVP_POSTURE_CANON_VERSION = "ove329.mvpPostureCanon.v1";
export const MVP_POSTURE_CANON_DEADLINE_MS = 30_000;

export const MVP_POSTURE_TERM_SOURCE =
  "fail.?closed|closed refusal|quarantine|original deletion|actual.?byte|noindex|robots|admin panel|another-user|negative proof";

export const MVP_POSTURE_CLASSES = [
  "active_forbidden",
  "active_required_guardrail",
  "historical_provenance",
  "product_research",
  "active_unrelated",
  "runtime_pending_child",
] as const;

export type MvpPostureClassification = (typeof MVP_POSTURE_CLASSES)[number];
export type MvpPostureOwner =
  | "OVE-330"
  | "OVE-331"
  | "OVE-332"
  | "OVE-333"
  | "OVE-334"
  | "OVE-335"
  | "OVE-336"
  | "OVE-337"
  | "OVE-338"
  | "OVE-339";

interface PathRule {
  path?: string;
  pathPrefix?: string;
  reason: string;
}

interface RuntimeRule extends PathRule {
  owner: MvpPostureOwner;
}

export interface MvpPostureClassificationManifest {
  version: typeof MVP_POSTURE_CANON_VERSION;
  evidenceBaselineSha: string;
  evidenceV1: {
    command: string;
    matchingTrackedFiles: number;
  };
  activeAuthorityPaths: string[];
  requiredGuardrailPaths?: string[];
  historicalPaths: string[];
  historicalPrefixes: string[];
  historicalDigests: Record<string, string>;
  productResearchPrefix: string;
  runtimeRules: RuntimeRule[];
  activeUnrelatedRules: PathRule[];
  ownerStates: Record<MvpPostureOwner, string>;
}

export interface MvpPostureClassificationEntry {
  path: string;
  anchor: string;
  class: MvpPostureClassification;
  reason: string;
  owner?: MvpPostureOwner;
}

export interface MvpPostureCanonViolation {
  code: string;
  path?: string;
  anchor?: string;
  owner?: string;
}

export interface MvpPostureCanonReceipt {
  version: typeof MVP_POSTURE_CANON_VERSION;
  status: "aligned" | "posture_drift" | "timed_out" | "cancelled";
  baselineSha: string;
  scannedTrackedFiles: number;
  matchingSpans: number;
  counts: Record<MvpPostureClassification, number>;
  entries: MvpPostureClassificationEntry[];
  durationMs: number;
  digest: string;
  violations: MvpPostureCanonViolation[];
}

interface CandidateSpan {
  path: string;
  anchor: string;
  content: string;
}

interface EvaluateOptions {
  manifest: MvpPostureClassificationManifest;
  baselineSha?: string;
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
  "docs/TECH_STACK_DECISIONS.md",
  "docs/adr/ADR-0018-mvp-posture.md",
  "docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md",
  "docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md",
  "apps/web/scripts/check-linear-agent-task.ts",
  "apps/web/scripts/check-linear-agent-task.test.ts",
  "docs/PRECISE_LOCATION_TEXT_FIREWALL.md",
  "docs/PUBLIC_PROJECTION_REVOCATION.md",
  "docs/CURRENT_SCHEMA_ERASURE.md",
  "docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md",
  "docs/SDD_VERTICAL_SLICE_ROADMAP.md",
  "docs/MIGRATION_ALLOCATION.md",
  "docs/MVP_POSTURE_CANON_CLASSIFICATION.json",
  "apps/web/scripts/check-mvp-posture-canon.ts",
  "apps/web/scripts/check-mvp-posture-canon.test.ts",
  "apps/web/package.json",
  ".github/workflows/ci.yml",
] as const;

export function evaluateMvpPostureCanon(
  files: Readonly<Record<string, string>>,
  options: EvaluateOptions,
): MvpPostureCanonReceipt {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const deadlineMs = options.deadlineMs ?? MVP_POSTURE_CANON_DEADLINE_MS;
  const baselineSha =
    options.baselineSha ?? options.manifest.evidenceBaselineSha;
  const violations: MvpPostureCanonViolation[] = [];

  if (options.signal?.aborted) {
    return terminalReceipt({
      status: "cancelled",
      baselineSha,
      durationMs: Math.ceil(now() - startedAt),
      violations: [{ code: "scan_cancelled" }],
    });
  }

  if (options.manifest.version !== MVP_POSTURE_CANON_VERSION) {
    violations.push({ code: "manifest_version_drift" });
  }
  if (!/^[a-f0-9]{40}$/.test(baselineSha)) {
    violations.push({ code: "invalid_baseline_sha" });
  }
  if (options.stableTree === false) {
    violations.push({ code: "changing_proof_baseline" });
  }
  violations.push(...findDuplicateRules(options.manifest));
  violations.push(...validateHistoricalDigests(files, options.manifest));

  const authorityOwners = options.manifest.activeAuthorityPaths.filter(
    (relativePath) =>
      /ADR-0018[^\n.]{0,120}\bsole\b|\bsole\b[^\n.]{0,120}ADR-0018/i.test(
        files[relativePath] ?? "",
      ),
  );
  if (authorityOwners.length > 1) {
    violations.push({ code: "multiple_active_posture_owners" });
  }

  const scopedFiles = Object.entries(files).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const entries: MvpPostureClassificationEntry[] = [];
  let scannedTrackedFiles = 0;

  for (const [relativePath, content] of scopedFiles) {
    if (options.signal?.aborted) {
      return terminalReceipt({
        status: "cancelled",
        baselineSha,
        durationMs: Math.ceil(now() - startedAt),
        violations: [{ code: "scan_cancelled" }],
      });
    }
    if (now() - startedAt > deadlineMs) {
      return terminalReceipt({
        status: "timed_out",
        baselineSha,
        durationMs: Math.ceil(now() - startedAt),
        violations: [{ code: "tracked_file_read_timeout" }],
      });
    }
    scannedTrackedFiles += 1;

    for (const span of extractCandidateSpans(relativePath, content)) {
      const entry = classifyCandidate(span, options.manifest);
      entries.push(entry);
      if (entry.class === "active_forbidden") {
        violations.push({
          code:
            entry.reason === "active_authority_contradiction"
              ? "active_posture_contradiction"
              : "unclassified_active_match",
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
    version: MVP_POSTURE_CANON_VERSION,
    status: violations.length === 0 ? "aligned" : "posture_drift",
    baselineSha,
    scannedTrackedFiles,
    matchingSpans: entries.length,
    counts,
    entries,
    durationMs: Math.ceil(now() - startedAt),
    digest: digestClassification(files, options.manifest, entries),
    violations,
  };
}

export function runMvpPostureCanonCheck(
  options: {
    repositoryRoot?: string;
    baselineSha?: string;
    injectReadTimeout?: boolean;
    signal?: AbortSignal;
    allowDirty?: boolean;
  } = {},
): MvpPostureCanonReceipt {
  const repositoryRoot = options.repositoryRoot ?? resolveRepositoryRoot();
  const manifest = readManifest(repositoryRoot);
  const before = readTreeIdentity(repositoryRoot);
  const files = readTrackedTextFiles(repositoryRoot);
  const after = readTreeIdentity(repositoryRoot);
  const stableTree =
    before.head === after.head &&
    before.workingTreeDigest === after.workingTreeDigest &&
    (options.allowDirty === true || before.dirty === false);

  if (options.injectReadTimeout) {
    let call = 0;
    return evaluateMvpPostureCanon(files, {
      manifest,
      baselineSha: options.baselineSha,
      deadlineMs: 1,
      now: () => (call++ === 0 ? 0 : 2),
      signal: options.signal,
      stableTree,
      strictConsumers: true,
    });
  }

  return evaluateMvpPostureCanon(files, {
    manifest,
    baselineSha: options.baselineSha,
    signal: options.signal,
    stableTree,
    strictConsumers: true,
  });
}

export function formatMvpPostureCanonReceipt(
  receipt: MvpPostureCanonReceipt,
): string {
  return JSON.stringify({
    version: receipt.version,
    status: receipt.status,
    baselineSha: receipt.baselineSha,
    scannedTrackedFiles: receipt.scannedTrackedFiles,
    matchingSpans: receipt.matchingSpans,
    counts: receipt.counts,
    durationMs: receipt.durationMs,
    digest: receipt.digest,
    violations: receipt.violations,
  });
}

export function parseMvpPostureCanonArguments(arguments_: readonly string[]): {
  baselineSha?: string;
  proveDeterminism: boolean;
  injectReadTimeout: boolean;
} {
  const normalized = arguments_.filter((argument) => argument !== "--");
  let baselineSha: string | undefined;
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

  return { baselineSha, proveDeterminism, injectReadTimeout };
}

function extractCandidateSpans(
  relativePath: string,
  content: string,
): CandidateSpan[] {
  const termPattern = new RegExp(MVP_POSTURE_TERM_SOURCE, "i");
  if (!termPattern.test(content)) return [];
  return content.split(/\r?\n/).flatMap((line, index) =>
    termPattern.test(line)
      ? [
          {
            path: relativePath,
            anchor: `lines ${index + 1}-${index + 1}`,
            content: line,
          },
        ]
      : [],
  );
}

function classifyCandidate(
  span: CandidateSpan,
  manifest: MvpPostureClassificationManifest,
): MvpPostureClassificationEntry {
  if (manifest.requiredGuardrailPaths?.includes(span.path)) {
    return entry(span, "active_required_guardrail", "canon_enforcement");
  }
  if (manifest.activeAuthorityPaths.includes(span.path)) {
    return isActiveContradiction(span.content)
      ? entry(span, "active_forbidden", "active_authority_contradiction")
      : entry(span, "active_required_guardrail", "adr0018_guardrail");
  }
  if (
    manifest.historicalPaths.includes(span.path) ||
    manifest.historicalPrefixes.some((prefix) =>
      span.path.startsWith(prefix),
    ) ||
    isDatedReceipt(span.content)
  ) {
    return entry(span, "historical_provenance", "historical_record");
  }
  if (span.path.startsWith(manifest.productResearchPrefix)) {
    return entry(span, "product_research", "research_record");
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

function isActiveContradiction(content: string): boolean {
  const retiredContext =
    /supersed|retir(?:e|ed|ement)|historical|provenance|old vocabulary|previous(?:ly)?|no longer|not (?:a )?current instruction|do(?:es)? not require|transition(?:al)?|pending OVE-/i.test(
      content,
    );
  const retiredTerm = new RegExp(
    `(?:${MVP_POSTURE_TERM_SOURCE}|blanket noindex|separate (?:operator|admin) panel)`,
    "i",
  );
  const imperative =
    /\b(?:always|must|shall|require(?:s|d)?|keep|retain|enforce|mandate(?:s|d)?)\b/i.test(
      content,
    );
  return retiredTerm.test(content) && imperative && !retiredContext;
}

function validateHistoricalDigests(
  files: Readonly<Record<string, string>>,
  manifest: MvpPostureClassificationManifest,
): MvpPostureCanonViolation[] {
  return Object.entries(manifest.historicalDigests).flatMap(
    ([relativePath, expectedDigest]) => {
      const content = files[relativePath];
      if (content === undefined) {
        return [{ code: "historical_receipt_missing", path: relativePath }];
      }
      return createHash("sha256").update(content).digest("hex") ===
        expectedDigest
        ? []
        : [{ code: "historical_receipt_rewritten", path: relativePath }];
    },
  );
}

function validateCurrentConsumers(
  files: Readonly<Record<string, string>>,
): MvpPostureCanonViolation[] {
  const violations: MvpPostureCanonViolation[] = [];
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
    "docs/SDD_VERTICAL_SLICE_ROADMAP.md",
  ]) {
    requireTerms(relativePath, ["ADR-0018"], "missing_mvp_posture_authority");
  }

  requireTerms(
    "docs/adr/ADR-0018-mvp-posture.md",
    [
      /unresolved authorization, ownership, or session condition resolves toward serving the request/i,
      /permits cross-account reads/i,
      "2026-08-19",
      "format-conversion-only",
      "PUBLIC_SURFACE_INDEXABILITY_THRESHOLD",
      /in-product admin/i,
      "OVE-330",
      "OVE-331",
      "OVE-332",
      "OVE-333",
      "OVE-334",
      "OVE-335",
      "OVE-336",
      "OVE-337",
      "OVE-338",
      "OVE-339",
    ],
    "adr0018_contract_drift",
  );

  for (const relativePath of [
    "docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md",
    "docs/linear/AI_AGENT_EXECUTION_ISSUE_TEMPLATE.md",
    "apps/web/scripts/check-linear-agent-task.ts",
    "apps/web/scripts/check-linear-agent-task.test.ts",
  ]) {
    requireTerms(
      relativePath,
      ["ADR-0018", /mvp[_-]posture/i],
      "task_posture_gate_drift",
    );
  }

  for (const relativePath of [
    "docs/PRECISE_LOCATION_TEXT_FIREWALL.md",
    "docs/PUBLIC_PROJECTION_REVOCATION.md",
    "docs/CURRENT_SCHEMA_ERASURE.md",
  ]) {
    requireTerms(
      relativePath,
      ["ADR-0018", /supersed/i],
      "runbook_successor_drift",
    );
  }

  requireTerms(
    "docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md",
    [
      "PUBLIC_SURFACE_INDEXABILITY_THRESHOLD",
      "minimumQualityClass",
      "partial",
      "minimumWordCount",
      "120",
      "minimumDistinctEntities",
      "maximumStalenessDays",
      "540",
    ],
    "indexability_threshold_drift",
  );
  requireTerms(
    "docs/MIGRATION_ALLOCATION.md",
    [
      /0031[^\n]*OVE-331/,
      /0032[^\n]*OVE-332/,
      /0033[^\n]*OVE-333/,
      /0034[^\n]*OVE-334/,
    ],
    "migration_allocation_drift",
  );
  requireTerms(
    "apps/web/package.json",
    ["mvp-posture:canon:check"],
    "missing_package_command",
  );
  requireTerms(
    ".github/workflows/ci.yml",
    ["mvp-posture:canon:check", "linear:task:standard:check"],
    "missing_ci_enforcement",
  );
  return violations;
}

function readManifest(
  repositoryRoot: string,
): MvpPostureClassificationManifest {
  return JSON.parse(
    readFileSync(
      path.join(repositoryRoot, "docs/MVP_POSTURE_CANON_CLASSIFICATION.json"),
      "utf8",
    ),
  ) as MvpPostureClassificationManifest;
}

function readTrackedTextFiles(repositoryRoot: string): Record<string, string> {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "buffer",
    timeout: MVP_POSTURE_CANON_DEADLINE_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  const relativePaths = output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
  for (const requiredPath of REQUIRED_CURRENT_CONSUMERS) {
    if (!relativePaths.includes(requiredPath)) relativePaths.push(requiredPath);
  }
  relativePaths.sort();
  const files: Record<string, string> = {};
  for (const relativePath of relativePaths) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(path.join(repositoryRoot, relativePath));
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
  workingTreeDigest: string;
  dirty: boolean;
} {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: MVP_POSTURE_CANON_DEADLINE_MS,
  }).trim();
  const trackedIndex = execFileSync("git", ["ls-files", "-s", "-z"], {
    cwd: repositoryRoot,
    encoding: "buffer",
    timeout: MVP_POSTURE_CANON_DEADLINE_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  const trackedDiff = execFileSync(
    "git",
    ["diff", "--binary", "--no-ext-diff", "HEAD", "--"],
    {
      cwd: repositoryRoot,
      encoding: "buffer",
      timeout: MVP_POSTURE_CANON_DEADLINE_MS,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  const untrackedOutput = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    {
      cwd: repositoryRoot,
      encoding: "buffer",
      timeout: MVP_POSTURE_CANON_DEADLINE_MS,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  const untrackedPaths = untrackedOutput
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((relativePath) =>
      REQUIRED_CURRENT_CONSUMERS.includes(
        relativePath as (typeof REQUIRED_CURRENT_CONSUMERS)[number],
      ),
    )
    .sort();
  const identity = createHash("sha256")
    .update(trackedIndex)
    .update(trackedDiff)
    .update(untrackedPaths.join("\0"));
  for (const relativePath of untrackedPaths) {
    identity.update(relativePath);
    try {
      identity.update(readFileSync(path.join(repositoryRoot, relativePath)));
    } catch {
      identity.update("missing_during_identity_read");
    }
  }
  return {
    head,
    workingTreeDigest: identity.digest("hex"),
    dirty: trackedDiff.length > 0 || untrackedPaths.length > 0,
  };
}

function findDuplicateRules(
  manifest: MvpPostureClassificationManifest,
): MvpPostureCanonViolation[] {
  const keys = [
    ...manifest.activeAuthorityPaths.map((value) => `authority:${value}`),
    ...(manifest.requiredGuardrailPaths ?? []).map(
      (value) => `guardrail:${value}`,
    ),
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
  durationMs: number;
  violations: MvpPostureCanonViolation[];
}): MvpPostureCanonReceipt {
  return {
    version: MVP_POSTURE_CANON_VERSION,
    status: input.status,
    baselineSha: input.baselineSha,
    scannedTrackedFiles: 0,
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
  manifest: MvpPostureClassificationManifest,
  entries: readonly MvpPostureClassificationEntry[],
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

function emptyCounts(): Record<MvpPostureClassification, number> {
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
  classification: MvpPostureClassification,
  reason: string,
): MvpPostureClassificationEntry {
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

function isTerminalState(state: string): boolean {
  return /^(?:done|completed|canceled|cancelled)$/i.test(state.trim());
}

function normalizeReason(reason: string): string {
  return reason
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function entryKey(entry_: MvpPostureClassificationEntry): string {
  return `${entry_.path}:${entry_.anchor}:${entry_.class}:${entry_.owner ?? ""}`;
}

function violationKey(violation: MvpPostureCanonViolation): string {
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
    const arguments_ = parseMvpPostureCanonArguments(process.argv.slice(2));
    const options = {
      baselineSha: arguments_.baselineSha,
      injectReadTimeout: arguments_.injectReadTimeout,
    };
    const first = runMvpPostureCanonCheck(options);
    if (arguments_.proveDeterminism) {
      const second = runMvpPostureCanonCheck(options);
      if (first.digest !== second.digest || first.status !== second.status) {
        first.status = "posture_drift";
        first.violations.push({ code: "nondeterministic_classification" });
      }
    }
    process.stdout.write(`${formatMvpPostureCanonReceipt(first)}\n`);
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
