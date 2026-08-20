import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const STABLE_REGISTRY_OBSERVED_CORPUS_SCALE = 129_188;
export const STABLE_REGISTRY_CANON_VERSION = "ove318.stableRegistryCanon.v1";
export const STABLE_REGISTRY_CANON_DEADLINE_MS = 30_000;

export const REQUIRED_STABLE_REGISTRY_CONSUMERS = [
  "AGENTS.md",
  "docs/adr/ADR-0016-stable-registry-observed-capture.md",
  "docs/STABLE_REGISTRY.md",
  "docs/MIGRATION_ALLOCATION.md",
  "docs/product-research/CATALOG_SOURCE_READINESS.md",
  "docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json",
  "docs/product-research/SPECIES_BACKBONE_POLICY.md",
  "docs/SDD_VERTICAL_SLICE_ROADMAP.md",
  "docs/SCAFFOLD_STATUS.md",
  "apps/web/src/server/catalog-source/eppo-source-contract.ts",
] as const;

export interface StableRegistryCanonViolation {
  code: string;
  path?: string;
}

export interface StableRegistryCanonReceipt {
  status: "aligned" | "canon_drift" | "timed_out" | "cancelled";
  version: typeof STABLE_REGISTRY_CANON_VERSION;
  baselineSha: string;
  observedCorpusScale: number;
  checkedConsumers: number;
  digest: string;
  durationMs: number;
  violations: StableRegistryCanonViolation[];
}

export function evaluateStableRegistryCanon(
  files: Readonly<Record<string, string>>,
  _options: {
    deadlineMs?: number;
    now?: () => number;
    signal?: AbortSignal;
    baselineSha?: string;
  } = {},
): StableRegistryCanonReceipt {
  const deadlineMs = _options.deadlineMs ?? STABLE_REGISTRY_CANON_DEADLINE_MS;
  const now = _options.now ?? (() => performance.now());
  const startedAt = now();
  const baselineSha = _options.baselineSha ?? "0".repeat(40);
  const violations: StableRegistryCanonViolation[] = [];
  const requiredConsumers = new Set<string>(
    REQUIRED_STABLE_REGISTRY_CONSUMERS,
  );

  if (_options.signal?.aborted) {
    return receipt({
      status: "cancelled",
      baselineSha,
      checkedConsumers: 0,
      durationMs: Math.ceil(now() - startedAt),
      digest: digestFiles(files),
      violations: [{ code: "scan_cancelled" }],
    });
  }

  for (const path of REQUIRED_STABLE_REGISTRY_CONSUMERS) {
    if (_options.signal?.aborted) {
      return receipt({
        status: "cancelled",
        baselineSha,
        checkedConsumers: 0,
        durationMs: Math.ceil(now() - startedAt),
        digest: digestFiles(files),
        violations: [{ code: "scan_cancelled" }],
      });
    }
    if (now() - startedAt > deadlineMs) {
      return receipt({
        status: "timed_out",
        baselineSha,
        checkedConsumers: 0,
        durationMs: Math.ceil(now() - startedAt),
        digest: digestFiles(files),
        violations: [{ code: "consumer_read_timeout" }],
      });
    }

    const content = files[path];
    if (content === undefined) {
      violations.push({ code: "missing_consumer", path });
      continue;
    }
    violations.push(...classifyContent(path, content));
  }

  for (const [path, content] of Object.entries(files)) {
    if (
      !requiredConsumers.has(path) &&
      /current stable registry authority\s*:/i.test(content)
    ) {
      violations.push({ code: "unknown_authority_consumer", path });
    }
  }

  violations.sort((left, right) =>
    `${left.path ?? ""}:${left.code}`.localeCompare(
      `${right.path ?? ""}:${right.code}`,
    ),
  );

  return {
    ...receipt({
      status: violations.length === 0 ? "aligned" : "canon_drift",
      baselineSha,
      checkedConsumers: REQUIRED_STABLE_REGISTRY_CONSUMERS.filter(
        (path) => files[path] !== undefined,
      ).length,
      durationMs: Math.ceil(now() - startedAt),
      digest: digestFiles(files),
      violations,
    }),
  };
}

export function runStableRegistryCanonCheck(
  options: {
    repositoryRoot?: string;
    injectConsumerTimeout?: boolean;
    signal?: AbortSignal;
  } = {},
): StableRegistryCanonReceipt {
  const repositoryRoot = options.repositoryRoot ?? resolveRepositoryRoot();
  const files = readStableRegistryCanonFiles(repositoryRoot);
  const baselineSha = readBaselineSha(repositoryRoot);
  if (options.injectConsumerTimeout) {
    let call = 0;
    return evaluateStableRegistryCanon(files, {
      deadlineMs: 1,
      now: () => (call++ === 0 ? 0 : 2),
      signal: options.signal,
      baselineSha,
    });
  }
  return evaluateStableRegistryCanon(files, {
    signal: options.signal,
    baselineSha,
  });
}

export function readStableRegistryCanonFiles(
  repositoryRoot = resolveRepositoryRoot(),
): Record<string, string> {
  const files: Record<string, string> = {};
  for (const relativePath of REQUIRED_STABLE_REGISTRY_CONSUMERS) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    if (existsSync(absolutePath)) {
      files[relativePath] = readFileSync(absolutePath, "utf8");
    }
  }

  for (const relativePath of listTrackedTextFiles(repositoryRoot)) {
    if (files[relativePath] !== undefined) continue;
    const absolutePath = path.join(repositoryRoot, relativePath);
    // A task may legitimately delete a tracked consumer before its commit.
    // Treat that path as absent instead of crashing the unrelated canon scan.
    if (!existsSync(absolutePath)) continue;
    const content = readFileSync(absolutePath, "utf8");
    if (/current stable registry authority\s*:/i.test(content)) {
      files[relativePath] = content;
    }
  }
  return files;
}

export function formatStableRegistryCanonReceipt(
  result: StableRegistryCanonReceipt,
): string {
  return JSON.stringify(result);
}

export function parseStableRegistryCanonArguments(
  arguments_: readonly string[],
): { injectConsumerTimeout: boolean } {
  const normalizedArguments = arguments_.filter((argument) => argument !== "--");
  const allowedArguments = new Set(["--inject-consumer-timeout"]);
  const unknownArgument = normalizedArguments.find(
    (argument) => !allowedArguments.has(argument),
  );
  if (unknownArgument) throw new Error("unknown_argument");
  return {
    injectConsumerTimeout: normalizedArguments.includes(
      "--inject-consumer-timeout",
    ),
  };
}

function classifyContent(
  path: string,
  content: string,
): StableRegistryCanonViolation[] {
  const violations: StableRegistryCanonViolation[] = [];
  const activeLines = content
    .split(/\r?\n/)
    .filter((line) => !isHistoricalLine(line));

  if (!/ADR-0016/i.test(content)) {
    violations.push({ code: "missing_authority_marker", path });
  }

  if (
    new Set([
      "docs/adr/ADR-0016-stable-registry-observed-capture.md",
      "docs/STABLE_REGISTRY.md",
      "docs/product-research/CATALOG_SOURCE_READINESS.md",
    ]).has(path)
  ) {
    for (const state of [
      "captured",
      "rights_cleared_source_public",
      "identity_resolved",
      "release_approved",
      "product_eligible",
    ]) {
      if (!content.includes(state)) {
        violations.push({ code: "missing_admission_state", path });
        break;
      }
    }
  }

  if (path === "docs/MIGRATION_ALLOCATION.md") {
    const allocations = [
      ["0023", "OVE-254"],
      ["0024", "OVE-255"],
      ["0025", "OVE-256"],
      ["0026", "OVE-257"],
      ["0027", "OVE-258"],
      ["0028", "OVE-259"],
    ] as const;
    if (
      allocations.some(
        ([migration, issue]) =>
          !new RegExp(`${migration}[^\\n]*${issue}`).test(content),
      )
    ) {
      violations.push({ code: "migration_allocation_drift", path });
    }
  }

  if (
    path ===
    "docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json"
  ) {
    let manifest: Record<string, unknown> | undefined;
    try {
      manifest = asRecord(JSON.parse(content));
    } catch {
      violations.push({ code: "invalid_consumer_json", path });
    }
    const readiness = asRecord(manifest?.fullImportReadiness);
    const stableRegistry = asRecord(readiness?.stableRegistryCanon);
    if (
      stableRegistry?.issue !== "OVE-318" ||
      stableRegistry.contractVersion !== 1 ||
      stableRegistry.authority !== "ADR-0016" ||
      stableRegistry.specification !== "docs/STABLE_REGISTRY.md" ||
      stableRegistry.observedCorpusScale !==
        STABLE_REGISTRY_OBSERVED_CORPUS_SCALE ||
      stableRegistry.sourceCompleteness !== "observed_capture" ||
      stableRegistry.productCompleteness !== "explicit_release_membership" ||
      stableRegistry.captureAuthorizedBy !== "OVE-254" ||
      stableRegistry.releaseConstructionOwnedBy !== "OVE-255" ||
      stableRegistry.historicalReceipt !== "OVE-253:blocked_manifest"
    ) {
      violations.push({ code: "stable_registry_manifest_drift", path });
    }
    const historicalContract = asRecord(readiness?.eppoFullCorpusContract);
    if (
      historicalContract?.issue !== "OVE-253" ||
      historicalContract.evidenceClass !== "historical_decision_receipt" ||
      historicalContract.terminalState !== "blocked_manifest"
    ) {
      violations.push({ code: "historical_receipt_class_drift", path });
    }
  }

  if (
    activeLines.some(
      (line) =>
        /official versioned checksum manifest/i.test(line) &&
        /(?:requires?|required|until|wait|block|before)/i.test(line),
    )
  ) {
    violations.push({ code: "stale_official_manifest_gate", path });
  }

  if (
    activeLines.some(
      (line) =>
        /current (?:stable registry )?authority\s*:\s*ADR-(?!0016\b)/i.test(
          line,
        ),
    )
  ) {
    violations.push({ code: "duplicate_decision_owner", path });
  }

  if (
    activeLines.some(
      (line) =>
        /raw source records?.*(?:directly|straight).*(?:picker|product)/i.test(
          line,
        ),
    )
  ) {
    violations.push({ code: "raw_to_product_projection", path });
  }

  if (
    activeLines.some(
      (line) =>
        /(?:active release|overgarden uuid).*(?:rewrite|mutat).*(?:in place|existing)|(?:rewrite|mutat).*(?:active release|overgarden uuid).*(?:in place|existing)/i.test(
          line,
        ) && !/never|forbidden|must not|immutable/i.test(line),
    )
  ) {
    violations.push({ code: "mutable_product_identity", path });
  }

  if (
    activeLines.some(
      (line) =>
        /exact (?:occurrence )?coordinates?.*(?:may|can).*(?:public search|product ui|logs?|evidence|analytics)|exact (?:occurrence )?coordinates?.*(?:public search|product ui|logs?|evidence|analytics).*(?:may|can|included?)/i.test(
          line,
        ) && !/never|forbidden|must not|outside/i.test(line),
    )
  ) {
    violations.push({ code: "unsafe_location_projection", path });
  }

  return violations;
}

function isHistoricalLine(line: string): boolean {
  return /historical|superseded|OVE-253.*receipt|receipt.*OVE-253/i.test(line);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function digestFiles(files: Readonly<Record<string, string>>): string {
  const canonical = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, content]) => `${path}\0${content.length}\0${content}`)
    .join("\n");
  return createHash("sha256")
    .update(`${STABLE_REGISTRY_CANON_VERSION}\n${canonical}`, "utf8")
    .digest("hex");
}

function receipt(input: {
  status: StableRegistryCanonReceipt["status"];
  baselineSha: string;
  checkedConsumers: number;
  durationMs: number;
  digest: string;
  violations: StableRegistryCanonViolation[];
}): StableRegistryCanonReceipt {
  return {
    version: STABLE_REGISTRY_CANON_VERSION,
    status: input.status,
    baselineSha: input.baselineSha,
    observedCorpusScale: STABLE_REGISTRY_OBSERVED_CORPUS_SCALE,
    checkedConsumers: input.checkedConsumers,
    durationMs: input.durationMs,
    digest: input.digest,
    violations: input.violations,
  };
}

function readBaselineSha(repositoryRoot: string): string {
  const baselineSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 5_000,
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(baselineSha)) {
    throw new Error("invalid_baseline_sha");
  }
  return baselineSha;
}

function listTrackedTextFiles(repositoryRoot: string): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--", "AGENTS.md", "docs", "apps/web/src"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return output
    .split("\0")
    .filter(
      (candidate) =>
        candidate.length > 0 && /\.(?:md|json|ts|tsx|yml|yaml)$/.test(candidate),
    );
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
    const arguments_ = parseStableRegistryCanonArguments(process.argv.slice(2));
    const result = runStableRegistryCanonCheck(arguments_);
    process.stdout.write(`${formatStableRegistryCanonReceipt(result)}\n`);
    if (result.status !== "aligned") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: "failed",
        reason:
          error instanceof Error ? error.message : "invalid_arguments",
      })}\n`,
    );
    process.exitCode = 1;
  }
}
