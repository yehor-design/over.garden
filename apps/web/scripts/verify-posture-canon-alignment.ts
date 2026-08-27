import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  runMvpPostureCanonCheck,
  type MvpPostureCanonReceipt,
} from "./check-mvp-posture-canon";

export const POSTURE_CANON_ALIGNMENT_VERSION =
  "ove339.postureCanonAlignment.v1";
export const POSTURE_CANON_ALIGNMENT_DEADLINE_MS = 600_000;
export const POSTURE_ALIGNMENT_RECORD_PATH =
  "docs/MVP_POSTURE_CONTRACT_ALIGNMENT.md";

const POSTURE_DOCUMENT_TERM =
  /fail[-_ ]?closed|fails? closed|failClosed|FailsClosed/i;

export type PostureDocumentClass = "live_authority" | "historical_receipt";

export interface PostureDocumentLedgerEntry {
  path: string;
  class: PostureDocumentClass;
  reason: string;
  sha256?: string;
}

const HISTORICAL_DOCUMENTS: Record<string, string> = {
  "docs/LEXICAL_STRUCTURED_JOURNAL_EDITOR_AUDIT.md":
    "95dd903aa732bab28a3764c056882c6b56ed6d688bf96d67580313628b0818b8",
  "docs/LOCALIZATION_COVERAGE_BASELINE_2026-07-14.md":
    "fe73e0c74c3085ee9ce584ff46866639a0d3a6cc4e4f4a3a80d23943e1ce3bee",
  "docs/PUBLIC_IDENTITY_MIGRATION_RUNBOOK.md":
    "6da194518ff5fa89d628ed1c4ca747d31586506be57641464e08b85f654a72e4",
  "docs/audit-inbox/AGENT_GOVERNANCE_REDESIGN_2026-08-15.md":
    "910e6c4126d77b976b71bceca7cba18ef4fc23208f8a20e22a6ca04f848e245a",
  "docs/audit-inbox/OFFLINE_REMOVAL_AUDIT.md":
    "a7799e417f375b7ff7a325ab5f301bf068fa88447192c1876a71cf9b2d4ae1a0",
  "docs/audit-inbox/STACK_REVALIDATION_2026-08-15.md":
    "aa90e1ad3bf6b0b71dbf95dafca304c5b38fce5c8c39866f2af588197d3c7ba6",
  "docs/linear/ove-317-lexical-structured-journal.md":
    "a288e1574c30254b5f8e9aa8fdee86097726a2d6b4a13a615f1fdaae7b9c00a5",
  "docs/reviews/2026-06-27-whole-repo-review.md":
    "f1143605841c4bcf3ad2637dcb99b3ea8e2b98592d4516ac564dc1a8785126ff",
  "docs/runbooks/OVE_303_FINAL_MAIN_PUBLIC_JOURNAL_SSR.md":
    "af50d370d4087fde7d93a59eee0ca7816e79671a9ad0ec4249acb8d6d7f6a47e",
  "docs/runbooks/OVE_304_FINAL_MAIN_ARCHIVE_410.md":
    "aa2d5af3be30274943b9f0d7c2b027262a2dc693950ebe65f53e7d9e1c3f0fc8",
  "docs/runbooks/OVE_306_FINAL_MAIN_JOURNAL_WORKER.md":
    "6e8af1730247ac1a2026824915638d6b18029223c3c34fabe24ff7134f93ef3d",
  "docs/runbooks/OVE_310_LAUNCH_WORKER_RESTART_RECOVERY.md":
    "7764e37c12c5ed6d6a96b534af9be0d47bbcaad25ec0c6077855e5e2d57f2c1f",
  "docs/runbooks/OVE_313_FINAL_MAIN_RESEND_DELIVERY.md":
    "cd86aba671417fe673190a807c837b34090bdf34432c121ac758280da3d42499",
  "docs/runbooks/OVE_314_OBSOLETE_CONTROL_PLANE_RETIREMENT.md":
    "27a639197f1a4158167c39cf191e1a11be5df4a6a7c9f97b0d3e203afeb09182",
  "docs/runbooks/OVE_316_R2_PATH_STYLE_RECOVERY.md":
    "1bd2988c2bc665b3f5e9d27218a519b08c6caf728b29998998c5bee17cf7cf4d",
  "docs/runbooks/OVE_350_LEGACY_QUARANTINE_PROVIDER_RETIREMENT.md":
    "337d47945dcf7af83bd15514a3f997aa302f711e73f0463ec4d31a9fb7887390",
};

const LIVE_DOCUMENT_REASONS: Record<string, string> = {
  "docs/AUTHENTICATED_GOOGLE_LINK_CONTRACT.md":
    "current_auth_provider_guardrail",
  "docs/CATALOG_ALIAS_SUGGESTION_REVIEW.md": "current_catalog_guardrail",
  "docs/CATALOG_FULL_IMPORT_DRY_RUN.md": "current_catalog_evidence_guardrail",
  "docs/CATALOG_GARDENER_TYPEAHEAD_READBACK.md": "current_catalog_guardrail",
  "docs/CATALOG_MATCH_SUGGESTION_QUEUE.md": "current_catalog_guardrail",
  "docs/CATALOG_SEED_ROLLOUT_PROOF.md": "current_catalog_release_guardrail",
  "docs/CURRENT_SCHEMA_ERASURE.md": "current_erasure_guardrail",
  "docs/DRIVE2_PARITY_PRODUCTION_CLOSEOUT.md": "current_release_guardrail",
  "docs/EPPO_OBSERVED_CAPTURE.md": "current_source_capture_guardrail",
  "docs/IDENTITY_POLICY.md": "current_identity_guardrail",
  "docs/INFRASTRUCTURE_REGISTRY.md": "current_infrastructure_guardrail",
  "docs/INTERFACE_LOCALE_CONTRACT.md": "current_locale_guardrail",
  "docs/LAUNCH_CORPUS.md": "current_launch_corpus_guardrail",
  "docs/LEGACY_DEVICE_DATA_RETIREMENT.md": "current_retirement_guardrail",
  "docs/LINEAGE_SCOPE_DECISION.md": "current_lineage_guardrail",
  "docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md":
    "current_task_construction_authority",
  "docs/LOCALIZATION_COVERAGE_WORKFLOW.md": "current_locale_coverage_guardrail",
  "docs/MAINLINE_CLOSEOUT.md": "current_delivery_guardrail",
  "docs/MVP_LEARNING_SIGNALS.md": "current_learning_guardrail",
  "docs/MVP_SCOPE_RECHECK_2026-07-03.md": "current_scope_authority",
  "docs/PUBLIC_JOURNAL_INDEX_PARITY.md": "current_search_parity_guardrail",
  "docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md":
    "current_discovery_threshold_guardrail",
  "docs/SDD_VERTICAL_SLICE_ROADMAP.md": "current_execution_roadmap",
  "docs/SESSION_LOCALE_CONVERGENCE.md": "current_session_locale_guardrail",
  "docs/STRUCTURED_JOURNAL_COMPOSER.md": "current_journal_document_guardrail",
  "docs/SUBJECT_AWARE_MEDIA.md": "current_media_presentation_guardrail",
  "docs/TYPOGRAPHY_CONTRACT.md": "current_typography_guardrail",
  "docs/VISUAL_FIXTURE_ENVIRONMENT.md": "current_fixture_guardrail",
  "docs/WALKING_SKELETON.md": "current_stack_skeleton",
  "docs/adr/ADR-0015-lexical-structured-journal-editor.md":
    "current_editor_adr_guardrail",
  "docs/adr/ADR-0017-online-only-product.md":
    "current_connectivity_adr_guardrail",
  "docs/architecture/AUTHENTICATED_ARCHITECTURE_INTEGRATION_PROOF.md":
    "current_architecture_proof_guardrail",
  "docs/architecture/AUTHENTICATED_MUTATION_ADMISSION.md":
    "current_mutation_guardrail",
  "docs/linear/ove-274-eppo-secure-credential-bootstrap.md":
    "current_pending_linear_contract",
};

export const POSTURE_DOCUMENT_LEDGER: PostureDocumentLedgerEntry[] = [
  ...Object.entries(LIVE_DOCUMENT_REASONS).map(([path_, reason]) => ({
    path: path_,
    class: "live_authority" as const,
    reason,
  })),
  ...Object.entries(HISTORICAL_DOCUMENTS).map(([path_, sha256]) => ({
    path: path_,
    class: "historical_receipt" as const,
    reason: historicalReason(path_),
    sha256,
  })),
].sort((left, right) => left.path.localeCompare(right.path));

export const REQUIRED_LIVE_ALIGNMENT_MARKERS: Record<
  string,
  readonly string[]
> = {
  "docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md": [
    "## OVE-339 posture classification",
    "execution-evidence gate",
    "ADR-0018",
  ],
  "docs/SDD_VERTICAL_SLICE_ROADMAP.md": [
    "## OVE-339 posture classification",
    "OVE-330 through OVE-339",
    "terminal",
  ],
  "docs/MAINLINE_CLOSEOUT.md": [
    "## OVE-339 posture classification",
    "delivery evidence",
    "ADR-0018",
  ],
  "docs/PUBLIC_JOURNAL_INDEX_PARITY.md": [
    "## OVE-339 posture classification",
    "operator consistency",
    "ADR-0018",
  ],
  "docs/architecture/AUTHENTICATED_MUTATION_ADMISSION.md": [
    "## OVE-339 posture classification",
    "write authorization",
    "OVE-332",
  ],
  "docs/LAUNCH_CORPUS.md": [
    "## OVE-339 posture classification",
    "content-class",
    "ADR-0019",
  ],
};

export const ALLOWED_POSTURE_ALIGNMENT_CHANGE_PATHS = new Set([
  "apps/web/scripts/check-mvp-posture-canon.test.ts",
  "apps/web/scripts/check-mvp-posture-canon.ts",
  "apps/web/scripts/verify-posture-canon-alignment.test.ts",
  "apps/web/scripts/verify-posture-canon-alignment.ts",
  "docs/LAUNCH_CORPUS.md",
  "docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md",
  "docs/MAINLINE_CLOSEOUT.md",
  "docs/MVP_POSTURE_CANON_CLASSIFICATION.json",
  "docs/MVP_POSTURE_CONTRACT_ALIGNMENT.md",
  "docs/ONLINE_ONLY_CANON_CLASSIFICATION.json",
  "docs/PUBLIC_JOURNAL_INDEX_PARITY.md",
  "docs/SDD_VERTICAL_SLICE_ROADMAP.md",
  "docs/architecture/AUTHENTICATED_MUTATION_ADMISSION.md",
  "docs/linear/CONTRACT_STATUS_MANIFEST.json",
]);

export interface PostureCanonAlignmentSnapshot {
  files: Record<string, string>;
  changedPaths: string[];
  repositoryHead?: string;
  mvpPostureReceipt: {
    status: string;
    runtimePendingChildCount: number;
    activeForbiddenCount: number;
  };
}

export interface PostureCanonAlignmentEntry {
  path: string;
  class: PostureDocumentClass;
  state: "reconciled" | "ledger_labelled" | "unclassified";
  reason: string;
  sha256?: string;
}

export interface PostureCanonAlignmentViolation {
  code: string;
  path?: string;
}

export type PostureCanonAlignmentStatus =
  | "idle"
  | "scanning"
  | "aligned"
  | "alignment_required"
  | "scan_already_running"
  | "timed_out"
  | "cancelled"
  | "failed";

export interface PostureCanonAlignmentReceipt {
  version: typeof POSTURE_CANON_ALIGNMENT_VERSION;
  status: PostureCanonAlignmentStatus;
  repositoryHead?: string;
  counts: {
    liveAuthority: number;
    historicalReceipt: number;
    reconciled: number;
    ledgerLabelled: number;
    unclassified: number;
    runtimePendingChild: number;
  };
  entries: PostureCanonAlignmentEntry[];
  durationMs: number;
  semanticDigest: string;
  violations: PostureCanonAlignmentViolation[];
}

interface EvaluationOptions {
  ledger?: readonly PostureDocumentLedgerEntry[];
  requiredAlignmentMarkers?: Readonly<Record<string, readonly string[]>>;
  allowedChangePaths?: ReadonlySet<string>;
  durationMs?: number;
}

interface ScanSessionDeps {
  readSnapshot?: (
    repositoryRoot: string,
    signal: AbortSignal,
  ) => Promise<PostureCanonAlignmentSnapshot>;
  evaluateOptions?: EvaluationOptions;
  now?: () => number;
}

export function evaluatePostureCanonAlignment(
  snapshot: PostureCanonAlignmentSnapshot,
  options: EvaluationOptions = {},
): PostureCanonAlignmentReceipt {
  const ledger = [...(options.ledger ?? POSTURE_DOCUMENT_LEDGER)];
  const requiredAlignmentMarkers =
    options.requiredAlignmentMarkers ?? REQUIRED_LIVE_ALIGNMENT_MARKERS;
  const allowedChangePaths =
    options.allowedChangePaths ?? ALLOWED_POSTURE_ALIGNMENT_CHANGE_PATHS;
  const violations: PostureCanonAlignmentViolation[] = [];
  const entries: PostureCanonAlignmentEntry[] = [];
  const ledgerByPath = new Map<string, PostureDocumentLedgerEntry>();

  for (const entry of ledger) {
    if (ledgerByPath.has(entry.path)) {
      violations.push({ code: "duplicate_ledger_path", path: entry.path });
      continue;
    }
    ledgerByPath.set(entry.path, entry);
  }

  const measuredPaths = discoverMeasuredDocuments(snapshot.files);
  const measuredSet = new Set(measuredPaths);
  for (const measuredPath of measuredPaths) {
    if (!ledgerByPath.has(measuredPath)) {
      violations.push({ code: "unclassified_document", path: measuredPath });
      entries.push({
        path: measuredPath,
        class: "live_authority",
        state: "unclassified",
        reason: "not_in_ledger",
      });
    }
  }

  const recordRows = parseAlignmentRecord(
    snapshot.files[POSTURE_ALIGNMENT_RECORD_PATH] ?? "",
  );

  for (const ledgerEntry of [...ledgerByPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    const content = snapshot.files[ledgerEntry.path];
    if (content === undefined || !measuredSet.has(ledgerEntry.path)) {
      violations.push({
        code: "measured_document_missing",
        path: ledgerEntry.path,
      });
      entries.push({
        path: ledgerEntry.path,
        class: ledgerEntry.class,
        state: "unclassified",
        reason: ledgerEntry.reason,
      });
      continue;
    }

    const recordRow = recordRows.get(ledgerEntry.path);
    if (recordRow === undefined) {
      violations.push({
        code: "alignment_record_missing_path",
        path: ledgerEntry.path,
      });
    } else if (
      recordRow.class !== ledgerEntry.class ||
      recordRow.reason !== ledgerEntry.reason
    ) {
      violations.push({
        code: "alignment_record_class_drift",
        path: ledgerEntry.path,
      });
    }

    if (ledgerEntry.class === "historical_receipt") {
      const actualDigest = sha256(content);
      if (
        ledgerEntry.sha256 === undefined ||
        actualDigest !== ledgerEntry.sha256
      ) {
        violations.push({
          code: "historical_receipt_rewritten",
          path: ledgerEntry.path,
        });
      }
      entries.push({
        path: ledgerEntry.path,
        class: ledgerEntry.class,
        state: "ledger_labelled",
        reason: ledgerEntry.reason,
        sha256: actualDigest,
      });
      continue;
    }

    const requiredMarkers = requiredAlignmentMarkers[ledgerEntry.path] ?? [];
    if (requiredMarkers.some((marker) => !content.includes(marker))) {
      violations.push({
        code: "live_authority_alignment_missing",
        path: ledgerEntry.path,
      });
    }
    entries.push({
      path: ledgerEntry.path,
      class: ledgerEntry.class,
      state: "reconciled",
      reason: ledgerEntry.reason,
    });
  }

  for (const recordPath of recordRows.keys()) {
    if (!ledgerByPath.has(recordPath)) {
      violations.push({
        code: "alignment_record_unexpected_path",
        path: recordPath,
      });
    }
  }

  for (const changedPath of [...new Set(snapshot.changedPaths)].sort()) {
    if (!allowedChangePaths.has(changedPath)) {
      violations.push({
        code: "application_scope_change",
        path: changedPath,
      });
    }
  }

  if (snapshot.mvpPostureReceipt.status !== "aligned") {
    violations.push({ code: "mvp_posture_classifier_not_aligned" });
  }
  if (snapshot.mvpPostureReceipt.activeForbiddenCount !== 0) {
    violations.push({ code: "mvp_posture_active_forbidden" });
  }
  if (snapshot.mvpPostureReceipt.runtimePendingChildCount !== 0) {
    violations.push({ code: "mvp_posture_runtime_still_pending" });
  }

  violations.sort((left, right) =>
    violationKey(left).localeCompare(violationKey(right)),
  );
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const counts = {
    liveAuthority: entries.filter((entry) => entry.class === "live_authority")
      .length,
    historicalReceipt: entries.filter(
      (entry) => entry.class === "historical_receipt",
    ).length,
    reconciled: entries.filter((entry) => entry.state === "reconciled").length,
    ledgerLabelled: entries.filter((entry) => entry.state === "ledger_labelled")
      .length,
    unclassified:
      entries.filter((entry) => entry.state === "unclassified").length +
      violations.filter(({ code }) => code === "duplicate_ledger_path").length,
    runtimePendingChild: snapshot.mvpPostureReceipt.runtimePendingChildCount,
  };
  const semanticDigest = sha256(
    JSON.stringify({
      version: POSTURE_CANON_ALIGNMENT_VERSION,
      counts,
      entries,
      violations,
    }),
  );

  return {
    version: POSTURE_CANON_ALIGNMENT_VERSION,
    status: violations.length === 0 ? "aligned" : "alignment_required",
    repositoryHead: snapshot.repositoryHead,
    counts,
    entries,
    durationMs: Math.max(0, Math.ceil(options.durationMs ?? 0)),
    semanticDigest,
    violations,
  };
}

export function runPostureCanonAlignmentCheck(
  options: {
    repositoryRoot?: string;
    allowDirty?: boolean;
  } = {},
): PostureCanonAlignmentReceipt {
  const repositoryRoot = options.repositoryRoot ?? resolveRepositoryRoot();
  const startedAt = performance.now();
  const snapshot = readSnapshotSync(repositoryRoot);
  if (options.allowDirty !== true && snapshot.changedPaths.length > 0) {
    snapshot.changedPaths.push("__dirty_tree_not_allowed__");
  }
  return evaluatePostureCanonAlignment(snapshot, {
    durationMs: performance.now() - startedAt,
  });
}

export function formatPostureCanonAlignmentReceipt(
  receipt: PostureCanonAlignmentReceipt,
) {
  return JSON.stringify({
    version: receipt.version,
    status: receipt.status,
    repositoryHead: receipt.repositoryHead,
    counts: receipt.counts,
    durationMs: receipt.durationMs,
    semanticDigest: receipt.semanticDigest,
    violations: receipt.violations,
  });
}

export class PostureCanonAlignmentScanSession {
  private readonly readSnapshot: NonNullable<ScanSessionDeps["readSnapshot"]>;
  private readonly evaluateOptions: EvaluationOptions;
  private readonly now: () => number;
  private generation = 0;
  private controller: AbortController | null = null;
  private receipt = emptyTerminalReceipt("idle", []);

  constructor(deps: ScanSessionDeps = {}) {
    this.readSnapshot = deps.readSnapshot ?? readSnapshotAsync;
    this.evaluateOptions = deps.evaluateOptions ?? {};
    this.now = deps.now ?? (() => performance.now());
  }

  inspectAlignmentStatusCommand(): PostureCanonAlignmentReceipt {
    return structuredClone(this.receipt);
  }

  cancelAlignmentCommand(): PostureCanonAlignmentReceipt {
    if (this.receipt.status === "scanning") {
      this.generation += 1;
      this.controller?.abort("operator_cancelled");
      this.receipt = emptyTerminalReceipt("cancelled", [
        { code: "scan_cancelled" },
      ]);
    }
    return this.inspectAlignmentStatusCommand();
  }

  async start(
    options: { repositoryRoot?: string; deadlineMs?: number } = {},
  ): Promise<PostureCanonAlignmentReceipt> {
    if (this.receipt.status === "scanning") {
      return emptyTerminalReceipt("scan_already_running", [
        { code: "scan_already_running" },
      ]);
    }
    const deadlineMs =
      options.deadlineMs ?? POSTURE_CANON_ALIGNMENT_DEADLINE_MS;
    if (
      !Number.isFinite(deadlineMs) ||
      deadlineMs <= 0 ||
      deadlineMs > POSTURE_CANON_ALIGNMENT_DEADLINE_MS
    ) {
      throw new TypeError(
        `Posture canon alignment deadline must be within ${POSTURE_CANON_ALIGNMENT_DEADLINE_MS}ms.`,
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
            () => reject(new AlignmentScanError("document_scan_timeout")),
            deadlineMs,
          );
        }),
      ]);
      if (generation !== this.generation || controller.signal.aborted) {
        return this.inspectAlignmentStatusCommand();
      }
      this.receipt = evaluatePostureCanonAlignment(snapshot, {
        ...this.evaluateOptions,
        durationMs: this.now() - startedAt,
      });
    } catch (error) {
      if (generation !== this.generation) {
        return this.inspectAlignmentStatusCommand();
      }
      controller.abort("classification_terminal");
      const timedOut =
        error instanceof AlignmentScanError &&
        error.code === "document_scan_timeout";
      this.receipt = {
        ...emptyTerminalReceipt(timedOut ? "timed_out" : "failed", [
          {
            code: timedOut ? "document_scan_timeout" : "document_scan_failed",
          },
        ]),
        durationMs: Math.max(0, Math.ceil(this.now() - startedAt)),
      };
    } finally {
      if (timer) clearTimeout(timer);
      if (generation === this.generation) this.controller = null;
    }
    return this.inspectAlignmentStatusCommand();
  }
}

export function parsePostureCanonAlignmentArguments(
  arguments_: readonly string[],
) {
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
  return {
    proveDeterminism,
    injectDependencyTimeout,
    emitAggregateReceipt,
  };
}

function historicalReason(relativePath: string) {
  if (relativePath.startsWith("docs/audit-inbox/")) {
    return "dated_audit_receipt";
  }
  if (relativePath.startsWith("docs/reviews/")) {
    return "dated_review_receipt";
  }
  if (relativePath.startsWith("docs/runbooks/")) {
    return "terminal_runbook_receipt";
  }
  if (relativePath.startsWith("docs/linear/")) {
    return "completed_linear_contract";
  }
  if (relativePath.includes("LOCALIZATION_COVERAGE_BASELINE")) {
    return "localization_baseline_receipt";
  }
  if (relativePath.includes("PUBLIC_IDENTITY_MIGRATION_RUNBOOK")) {
    return "completed_migration_runbook";
  }
  return "ove317_baseline_receipt";
}

function discoverMeasuredDocuments(files: Readonly<Record<string, string>>) {
  return Object.entries(files)
    .filter(
      ([relativePath, content]) =>
        relativePath.startsWith("docs/") &&
        relativePath.endsWith(".md") &&
        !relativePath.startsWith("docs/product-research/") &&
        !relativePath.startsWith("docs/superpowers/") &&
        POSTURE_DOCUMENT_TERM.test(content),
    )
    .map(([relativePath]) => relativePath)
    .sort();
}

function parseAlignmentRecord(content: string) {
  const rows = new Map<
    string,
    { class: PostureDocumentClass; reason: string }
  >();
  const rowPattern =
    /^\|\s+`([^`]+)`\s+\|\s+`(live_authority|historical_receipt)`\s+\|\s+`([a-z0-9_]+)`\s+\|[^|]+\|$/;
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(rowPattern);
    if (!match) continue;
    if (rows.has(match[1]!)) {
      rows.set(match[1]!, {
        class: match[2]! as PostureDocumentClass,
        reason: "duplicate_alignment_record_row",
      });
      continue;
    }
    rows.set(match[1]!, {
      class: match[2]! as PostureDocumentClass,
      reason: match[3]!,
    });
  }
  return rows;
}

function readSnapshotSync(
  repositoryRoot: string,
): PostureCanonAlignmentSnapshot {
  const files = readRepositoryMarkdownFilesSync(repositoryRoot);
  const mvpReceipt = runMvpPostureCanonCheck({
    repositoryRoot,
    allowDirty: true,
  });
  return {
    files,
    changedPaths: readChangedPaths(repositoryRoot),
    repositoryHead: readRepositoryHead(repositoryRoot),
    mvpPostureReceipt: simplifyMvpReceipt(mvpReceipt),
  };
}

async function readSnapshotAsync(
  repositoryRoot: string,
  signal: AbortSignal,
): Promise<PostureCanonAlignmentSnapshot> {
  const paths = listRepositoryMarkdownPaths(repositoryRoot);
  const files: Record<string, string> = {};
  for (const relativePath of paths) {
    if (signal.aborted) throw new AlignmentScanError("scan_cancelled");
    files[relativePath] = await readFile(
      path.join(repositoryRoot, relativePath),
      { encoding: "utf8", signal },
    );
  }
  if (signal.aborted) throw new AlignmentScanError("scan_cancelled");
  const mvpReceipt = runMvpPostureCanonCheck({
    repositoryRoot,
    allowDirty: true,
  });
  return {
    files,
    changedPaths: readChangedPaths(repositoryRoot),
    repositoryHead: readRepositoryHead(repositoryRoot),
    mvpPostureReceipt: simplifyMvpReceipt(mvpReceipt),
  };
}

function readRepositoryMarkdownFilesSync(repositoryRoot: string) {
  return Object.fromEntries(
    listRepositoryMarkdownPaths(repositoryRoot).map((relativePath) => [
      relativePath,
      readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
    ]),
  );
}

function listRepositoryMarkdownPaths(repositoryRoot: string) {
  const output = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "docs",
    ],
    {
      cwd: repositoryRoot,
      encoding: "buffer",
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  return [...new Set(output.toString("utf8").split("\0").filter(Boolean))]
    .filter(
      (relativePath) =>
        relativePath.endsWith(".md") &&
        existsSync(path.join(repositoryRoot, relativePath)),
    )
    .sort();
}

function readChangedPaths(repositoryRoot: string) {
  const tracked = execFileSync(
    "git",
    ["diff", "--name-only", "--no-ext-diff", "HEAD", "--"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 30_000,
    },
  )
    .split(/\r?\n/)
    .filter(Boolean);
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 30_000,
    },
  )
    .split(/\r?\n/)
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

function readRepositoryHead(repositoryRoot: string) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 30_000,
  }).trim();
}

function simplifyMvpReceipt(receipt: MvpPostureCanonReceipt) {
  return {
    status: receipt.status,
    runtimePendingChildCount: receipt.counts.runtime_pending_child,
    activeForbiddenCount: receipt.counts.active_forbidden,
  };
}

function emptyTerminalReceipt(
  status: PostureCanonAlignmentStatus,
  violations: PostureCanonAlignmentViolation[],
): PostureCanonAlignmentReceipt {
  const counts = {
    liveAuthority: 0,
    historicalReceipt: 0,
    reconciled: 0,
    ledgerLabelled: 0,
    unclassified: 0,
    runtimePendingChild: 0,
  };
  return {
    version: POSTURE_CANON_ALIGNMENT_VERSION,
    status,
    counts,
    entries: [],
    durationMs: 0,
    semanticDigest: sha256(
      JSON.stringify({
        version: POSTURE_CANON_ALIGNMENT_VERSION,
        status,
        counts,
        violations,
      }),
    ),
    violations,
  };
}

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function violationKey(violation: PostureCanonAlignmentViolation) {
  return `${violation.path ?? ""}\0${violation.code}`;
}

function resolveRepositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

class AlignmentScanError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function main() {
  const options = parsePostureCanonAlignmentArguments(process.argv.slice(2));
  const primary = await new PostureCanonAlignmentScanSession().start();
  let determinism = { checked: false, matched: false };
  if (options.proveDeterminism) {
    const replay = await new PostureCanonAlignmentScanSession().start();
    determinism = {
      checked: true,
      matched:
        primary.status === "aligned" &&
        replay.status === "aligned" &&
        primary.semanticDigest === replay.semanticDigest,
    };
  }

  let timeoutProbe = { checked: false, status: "not_requested" };
  if (options.injectDependencyTimeout) {
    const timeoutSession = new PostureCanonAlignmentScanSession({
      readSnapshot: async () =>
        new Promise<PostureCanonAlignmentSnapshot>(() => undefined),
    });
    const timeout = await timeoutSession.start({ deadlineMs: 5 });
    timeoutProbe = { checked: true, status: timeout.status };
  }

  const ok =
    primary.status === "aligned" &&
    (!options.proveDeterminism || determinism.matched) &&
    (!options.injectDependencyTimeout || timeoutProbe.status === "timed_out");
  console.log(
    JSON.stringify(
      {
        schemaVersion: "ove339.postureCanonAlignmentAggregate.v1",
        ok,
        aggregateRequested: options.emitAggregateReceipt,
        receipt: JSON.parse(formatPostureCanonAlignmentReceipt(primary)),
        determinism,
        timeoutProbe,
        writesTrackedFiles: false,
        applicationRuntimeTouched: false,
        productionDataTouched: false,
      },
      null,
      2,
    ),
  );
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
        schemaVersion: "ove339.postureCanonAlignmentAggregate.v1",
        errorClass: error instanceof Error ? error.name : "unknown_error",
      }),
    );
    process.exitCode = 1;
  });
}
