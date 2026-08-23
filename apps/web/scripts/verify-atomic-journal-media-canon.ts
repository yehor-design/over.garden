import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ATOMIC_JOURNAL_MEDIA_CANON_VERSION =
  "ove345.atomicJournalMediaCanon.v1";
export const ATOMIC_JOURNAL_MEDIA_CANON_DEADLINE_MS = 30_000;

const HISTORICAL_ADR_DIGESTS = {
  "docs/adr/ADR-0017-online-only-product.md":
    "3bbc125b9aae90905e28f2c0caf08e2ddb02ee18dd0a5e3a3d96b36bfddc648c",
  "docs/adr/ADR-0018-mvp-posture.md":
    "fa9db7213921bf354a3f39e64cc091fef3529ba89abf3004789c5cf7538f4e1a",
} as const;

const CHILD_DAG =
  "OVE-333 -> OVE-345 -> OVE-346 -> OVE-347 -> OVE-348 -> OVE-349 -> OVE-350";

const CURRENT_AUTHORITY_REQUIREMENTS = {
  "docs/adr/ADR-0019-atomic-local-journal-media.md": [
    ATOMIC_JOURNAL_MEDIA_CANON_VERSION,
    "local-only and non-durable before Publish",
    "browser-generated WebP is the sole final artifact",
    "image bytes never traverse a Vercel Function",
    "overgarden-media-staging",
    "media-stage.over.garden",
    "MEDIA_STAGING_SESSIONS",
    CHILD_DAG,
  ],
  "AGENTS.md": [
    "ADR-0019",
    "local-only and non-durable before Publish",
    "browser-generated WebP is the sole final artifact",
  ],
  "docs/TECH_STACK_DECISIONS.md": [
    "ADR-0019",
    "local-only and non-durable before Publish",
    "browser-generated WebP is the sole final artifact",
  ],
  "docs/MVP_SCOPE_RECHECK_2026-07-03.md": [
    "ADR-0019",
    "local-only and non-durable before Publish",
    "browser-generated WebP is the sole final artifact",
  ],
  "docs/ONLINE_ONLY_CANON_CLASSIFICATION.json": [
    "docs/adr/ADR-0019-atomic-local-journal-media.md",
  ],
  "docs/SDD_VERTICAL_SLICE_ROADMAP.md": ["ADR-0019", CHILD_DAG],
  "docs/INFRASTRUCTURE_REGISTRY.md": [
    "ADR-0019",
    "overgarden-media-staging",
    "media-stage.over.garden",
    "MEDIA_STAGING_SESSIONS",
    "unprovisioned until OVE-346",
  ],
} as const;

const PRESERVED_OWNER_PATHS = [
  "apps/web/src/lib/garden/journal-document.ts",
  "apps/web/src/lib/privacy/precise-location-text.ts",
  "apps/web/src/server/media/lifecycle-revoke.ts",
  "apps/web/src/server/search/public-projection-outbox.ts",
  "docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md",
  "docs/CURRENT_SCHEMA_ERASURE.md",
] as const;

const ALL_REQUIRED_PATHS = [
  ...Object.keys(HISTORICAL_ADR_DIGESTS),
  ...Object.keys(CURRENT_AUTHORITY_REQUIREMENTS),
  ...PRESERVED_OWNER_PATHS,
] as const;

export type AtomicJournalMediaCanonStatus =
  | "aligned"
  | "contradiction"
  | "missing_owner"
  | "stale_readback"
  | "timed_out"
  | "cancelled";

export interface AtomicJournalMediaCanonViolation {
  code:
    | "active_atomic_media_contradiction"
    | "historical_adr_digest_mismatch"
    | "missing_authority_path"
    | "missing_authority_statement"
    | "missing_child_dag"
    | "missing_preserved_owner"
    | "canon_file_read_timeout"
    | "canon_scan_cancelled";
  path?: string;
  rule?: string;
}

export interface AtomicJournalMediaCanonInput {
  baselineSha: string;
  files: Record<string, string>;
  historicalDigests: Record<string, string>;
}

export interface AtomicJournalMediaCanonReceipt {
  version: typeof ATOMIC_JOURNAL_MEDIA_CANON_VERSION;
  status: AtomicJournalMediaCanonStatus;
  baselineSha: string;
  scannedFiles: number;
  durationMs: number;
  digest: string;
  violations: AtomicJournalMediaCanonViolation[];
}

interface EvaluateOptions {
  deadlineMs?: number;
  now?: () => number;
  signal?: AbortSignal;
}

export function evaluateAtomicJournalMediaCanon(
  input: AtomicJournalMediaCanonInput,
  options: EvaluateOptions = {},
): AtomicJournalMediaCanonReceipt {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const deadlineMs =
    options.deadlineMs ?? ATOMIC_JOURNAL_MEDIA_CANON_DEADLINE_MS;

  if (options.signal?.aborted) {
    return terminalReceipt(input.baselineSha, "cancelled", 0, 0, [
      { code: "canon_scan_cancelled" },
    ]);
  }
  if (now() - startedAt > deadlineMs) {
    return terminalReceipt(input.baselineSha, "timed_out", 0, 0, [
      { code: "canon_file_read_timeout" },
    ]);
  }

  const violations: AtomicJournalMediaCanonViolation[] = [];
  let scannedFiles = 0;

  for (const [relativePath, expectedDigest] of Object.entries(
    input.historicalDigests,
  ).sort(([left], [right]) => left.localeCompare(right))) {
    const content = input.files[relativePath];
    if (content === undefined) {
      violations.push({ code: "missing_authority_path", path: relativePath });
      continue;
    }
    scannedFiles += 1;
    if (sha256(content) !== expectedDigest) {
      violations.push({
        code: "historical_adr_digest_mismatch",
        path: relativePath,
      });
    }
  }

  for (const [relativePath, requirements] of Object.entries(
    CURRENT_AUTHORITY_REQUIREMENTS,
  ).sort(([left], [right]) => left.localeCompare(right))) {
    if (options.signal?.aborted) {
      return terminalReceipt(
        input.baselineSha,
        "cancelled",
        scannedFiles,
        Math.ceil(now() - startedAt),
        [{ code: "canon_scan_cancelled" }],
      );
    }
    if (now() - startedAt > deadlineMs) {
      return terminalReceipt(
        input.baselineSha,
        "timed_out",
        scannedFiles,
        Math.ceil(now() - startedAt),
        [{ code: "canon_file_read_timeout" }],
      );
    }
    const content = input.files[relativePath];
    if (content === undefined) {
      violations.push({ code: "missing_authority_path", path: relativePath });
      continue;
    }
    scannedFiles += 1;
    const normalizedContent = normalizeMarkdownText(content);
    for (const required of requirements) {
      if (!normalizedContent.includes(normalizeMarkdownText(required))) {
        violations.push({
          code:
            relativePath === "docs/SDD_VERTICAL_SLICE_ROADMAP.md" &&
            required === CHILD_DAG
              ? "missing_child_dag"
              : "missing_authority_statement",
          path: relativePath,
          rule: sha256(required).slice(0, 12),
        });
      }
    }
    if (hasActiveContradiction(content)) {
      violations.push({
        code: "active_atomic_media_contradiction",
        path: relativePath,
      });
    }
  }

  for (const relativePath of PRESERVED_OWNER_PATHS) {
    if (input.files[relativePath] === undefined) {
      violations.push({ code: "missing_preserved_owner", path: relativePath });
    } else {
      scannedFiles += 1;
    }
  }

  violations.sort((left, right) =>
    `${left.code}:${left.path ?? ""}:${left.rule ?? ""}`.localeCompare(
      `${right.code}:${right.path ?? ""}:${right.rule ?? ""}`,
    ),
  );

  const status = classifyStatus(violations);
  const durationMs = Math.ceil(now() - startedAt);
  return {
    version: ATOMIC_JOURNAL_MEDIA_CANON_VERSION,
    status,
    baselineSha: input.baselineSha,
    scannedFiles,
    durationMs,
    digest: digestInput(input),
    violations,
  };
}

export function runAtomicJournalMediaCanonVerification(
  options: {
    repositoryRoot?: string;
    baselineSha?: string;
    signal?: AbortSignal;
    injectReadTimeout?: boolean;
  } = {},
): AtomicJournalMediaCanonReceipt {
  const repositoryRoot = options.repositoryRoot ?? resolveRepositoryRoot();
  const baselineSha =
    options.baselineSha ??
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  const files: Record<string, string> = {};
  for (const relativePath of ALL_REQUIRED_PATHS) {
    try {
      files[relativePath] = readFileSync(
        path.join(repositoryRoot, relativePath),
        "utf8",
      );
    } catch {
      // Missing paths are emitted as closed violation classes below.
    }
  }
  return evaluateAtomicJournalMediaCanon(
    {
      baselineSha,
      files,
      historicalDigests: { ...HISTORICAL_ADR_DIGESTS },
    },
    {
      signal: options.signal,
      deadlineMs: options.injectReadTimeout ? -1 : undefined,
    },
  );
}

export function formatAtomicJournalMediaCanonReceipt(
  receipt: AtomicJournalMediaCanonReceipt,
) {
  return JSON.stringify(
    {
      version: receipt.version,
      status: receipt.status,
      baselineSha: receipt.baselineSha,
      scannedFiles: receipt.scannedFiles,
      durationMs: receipt.durationMs,
      digest: receipt.digest,
      violations: receipt.violations,
    },
    null,
    2,
  );
}

function terminalReceipt(
  baselineSha: string,
  status: "timed_out" | "cancelled",
  scannedFiles: number,
  durationMs: number,
  violations: AtomicJournalMediaCanonViolation[],
): AtomicJournalMediaCanonReceipt {
  return {
    version: ATOMIC_JOURNAL_MEDIA_CANON_VERSION,
    status,
    baselineSha,
    scannedFiles,
    durationMs,
    digest: sha256(`${status}:${baselineSha}:${scannedFiles}`),
    violations,
  };
}

function classifyStatus(
  violations: readonly AtomicJournalMediaCanonViolation[],
): AtomicJournalMediaCanonStatus {
  if (
    violations.some(
      (violation) => violation.code === "historical_adr_digest_mismatch",
    )
  ) {
    return "stale_readback";
  }
  if (
    violations.some(
      (violation) => violation.code === "active_atomic_media_contradiction",
    )
  ) {
    return "contradiction";
  }
  return violations.length > 0 ? "missing_owner" : "aligned";
}

function hasActiveContradiction(content: string) {
  return content.split(/\r?\n/).some((line) => {
    if (
      /historical|transitional|supersed|rejected|never|forbid|does not|no longer/i.test(
        line,
      )
    ) {
      return false;
    }
    return (
      /current target.*server-authoritative drafts?/i.test(line) ||
      /current target.*server re-encod/i.test(line) ||
      /current target.*(?:image|media) bytes.*(?:through|traverse|cross).*Vercel Function/i.test(
        line,
      ) ||
      /current target.*background upload.*(?:tab closure|tab closes?)/i.test(
        line,
      ) ||
      /current target.*publish(?:es|ing)?.*pending[- ]media/i.test(line) ||
      /current target.*(?:creates?|persists?).*(?:private|pending).*journal (?:record|entry).*before Publish/i.test(
        line,
      ) ||
      /client processing (?:is|remains) (?:only )?(?:an? )?(?:bandwidth )?optimization/i.test(
        line,
      ) ||
      /server re-encod(?:e|ing).*final (?:image|artifact)/i.test(line)
    );
  });
}

function normalizeMarkdownText(content: string) {
  return content.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
}

function digestInput(input: AtomicJournalMediaCanonInput) {
  const hash = createHash("sha256");
  hash.update(ATOMIC_JOURNAL_MEDIA_CANON_VERSION);
  hash.update("\0");
  hash.update(input.baselineSha);
  for (const [relativePath, content] of Object.entries(input.files).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    hash.update("\0");
    hash.update(relativePath);
    hash.update("\0");
    hash.update(sha256(content));
  }
  return hash.digest("hex");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function resolveRepositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function parseArguments(argv: string[]) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  let baselineSha: string | undefined;
  let proveDeterminism = false;
  let injectReadTimeout = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--baseline") {
      baselineSha = args[index + 1];
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
    throw new Error(`unknown_argument:${argument}`);
  }
  return { baselineSha, proveDeterminism, injectReadTimeout };
}

function main(argv: string[]) {
  const args = parseArguments(argv);
  const first = runAtomicJournalMediaCanonVerification(args);
  if (args.proveDeterminism) {
    const second = runAtomicJournalMediaCanonVerification(args);
    if (first.digest !== second.digest || first.status !== second.status) {
      throw new Error("canon_receipt_nondeterministic");
    }
  }
  process.stdout.write(`${formatAtomicJournalMediaCanonReceipt(first)}\n`);
  if (first.status !== "aligned") process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2));
}
