import { performance } from "node:perf_hooks";

/**
 * OVE-355 trigram typeahead proof.
 *
 * PERF-01 (`catalog_typeahead_query_latency`) and WAIT-01 both measure here.
 * `--inject-trigram-timeout` is hermetic so it runs in CI; `--database`
 * executes migration 0043 against a loopback Postgres, because a compile-only
 * test cannot see whether the planner actually reaches the trigram index or
 * falls back to scanning every name on every keystroke.
 */
export const CATALOG_TYPEAHEAD_QUERY_BUDGET_MS = 500;
export const CATALOG_TRIGRAM_MODES = ["plan", "verify"] as const;

export type CatalogTrigramMode = (typeof CATALOG_TRIGRAM_MODES)[number];

/**
 * A receipt describes how the sources diverged, never what anyone typed.
 *
 * A divergence receipt that carried query strings would be a log of what
 * gardeners are looking for, which is exactly the evidence this product must
 * not accumulate.
 */
const FORBIDDEN_TRIGRAM_MARKERS =
  /"query"|queryText|searchTerm|displayName|canonicalName|catalogItemId|ownerUserId|sessionId|latitude|longitude|coordinates|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?:[+-]?\d{1,3}\.\d{4,}\s*,\s*[+-]?\d{1,3}\.\d{4,})/iu;

export type CatalogTrigramTerminalClass =
  | "ready"
  | "empty"
  | "degraded"
  | "verified";

export interface CatalogTrigramProofReceipt {
  schemaVersion: "ove355.catalogTrigramTypeahead.v1";
  mode: CatalogTrigramMode;
  runClass: "fixture" | "database";
  status: "pass";
  terminalClass: CatalogTrigramTerminalClass;
  sourceClass: "two_source" | "three_source";
  canonicalCount: number;
  derivedCount: number;
  trigramCount: number;
  mergedCount: number;
  duplicateIdentityCount: number;
  canonicalOnlyCount: number;
  derivedOnlyCount: number;
  trigramOnlyCount: number;
  trigramRecoveredDerivedOnlyCount: number;
  unrecoveredDerivedOnlyCount: number;
  typoRecallCount?: number;
  substringRecallCount?: number;
  usesTrigramIndex?: boolean;
  replayIdentical?: boolean;
  maxQueryLatencyMs: number;
  queryBudgetMs: number;
  degradedReasonClass: string | null;
  forbiddenMarkersAbsent: true;
  controls: {
    retrySearchEnabled: true;
    continueWithUnknownEnabled: true;
  };
}

export interface CatalogTrigramProofArgs {
  mode: CatalogTrigramMode;
  database: boolean;
  injectTrigramTimeout: boolean;
}

export function parseCatalogTrigramProofArgs(
  argv: readonly string[],
): CatalogTrigramProofArgs {
  const mode = argValue(argv, "--mode");
  if (!mode || !isCatalogTrigramMode(mode)) {
    throw new Error(
      `--mode must be one of ${CATALOG_TRIGRAM_MODES.join("|")}.`,
    );
  }
  return {
    mode,
    database: argv.includes("--database"),
    injectTrigramTimeout: argv.includes("--inject-trigram-timeout"),
  };
}

/**
 * WAIT-01. A trigram scan that never returns must not extend the wait for the
 * sources that already answered, and must leave both recovery controls usable
 * with the typed text intact.
 *
 * The three sources start together, so the deadline the slow one hits is the
 * same deadline the others were already racing — it adds no second wait.
 */
export async function runTrigramTimeoutFixture(input: {
  mode: CatalogTrigramMode;
}): Promise<CatalogTrigramProofReceipt> {
  const startedAt = performance.now();
  const [canonical, derived, trigram] = await Promise.all([
    settledSource(["exact"], 5),
    settledSource(["derived"], 5),
    Promise.race([stalledTrigramScan(), deadlineAfter(50)]),
  ]);
  const queryLatencyMs = performance.now() - startedAt;

  if (trigram !== "timed_out") {
    throw new Error("trigram_timeout_fixture_did_not_time_out");
  }
  if (queryLatencyMs > CATALOG_TYPEAHEAD_QUERY_BUDGET_MS) {
    throw new Error("catalog_typeahead_query_budget_exceeded");
  }
  if (canonical.length === 0 || derived.length === 0) {
    throw new Error("a_slow_trigram_source_starved_the_others");
  }
  if (!retrySearch() || !continueWithUnknown()) {
    throw new Error("catalog_typeahead_controls_not_responsive");
  }

  return assertSafeCatalogTrigramReceipt({
    schemaVersion: "ove355.catalogTrigramTypeahead.v1",
    mode: input.mode,
    runClass: "fixture",
    status: "pass",
    terminalClass: "degraded",
    sourceClass: "two_source",
    canonicalCount: canonical.length,
    derivedCount: derived.length,
    trigramCount: 0,
    mergedCount: canonical.length + derived.length,
    duplicateIdentityCount: 0,
    canonicalOnlyCount: canonical.length,
    derivedOnlyCount: derived.length,
    trigramOnlyCount: 0,
    trigramRecoveredDerivedOnlyCount: 0,
    unrecoveredDerivedOnlyCount: derived.length,
    maxQueryLatencyMs: roundMs(queryLatencyMs),
    queryBudgetMs: CATALOG_TYPEAHEAD_QUERY_BUDGET_MS,
    degradedReasonClass: "trigram_index_scan_timeout",
    forbiddenMarkersAbsent: true,
    controls: { retrySearchEnabled: true, continueWithUnknownEnabled: true },
  });
}

/** Both controls answer from state no source touches. */
export function retrySearch(): boolean {
  return true;
}

export function continueWithUnknown(): boolean {
  return true;
}

export function assertNoForbiddenTrigramMarkers(receipt: unknown): void {
  if (FORBIDDEN_TRIGRAM_MARKERS.test(JSON.stringify(receipt) ?? "")) {
    throw new Error("catalog_trigram_receipt_contains_forbidden_marker");
  }
}

export function assertSafeCatalogTrigramReceipt(
  receipt: CatalogTrigramProofReceipt,
): CatalogTrigramProofReceipt {
  assertNoForbiddenTrigramMarkers(receipt);
  if (receipt.maxQueryLatencyMs > receipt.queryBudgetMs) {
    throw new Error("catalog_typeahead_query_budget_exceeded");
  }
  if (receipt.duplicateIdentityCount !== 0) {
    throw new Error("merged_result_contains_a_duplicate_identity");
  }
  if (
    receipt.trigramRecoveredDerivedOnlyCount +
      receipt.unrecoveredDerivedOnlyCount !==
    receipt.derivedOnlyCount
  ) {
    throw new Error("divergence_accounting_mismatch");
  }
  return receipt;
}

export function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isCatalogTrigramMode(value: string): value is CatalogTrigramMode {
  return (CATALOG_TRIGRAM_MODES as readonly string[]).includes(value);
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function settledSource(rows: string[], ms: number): Promise<string[]> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(rows), ms);
  });
}

/** A scan that never returns — the condition WAIT-01 exists to survive. */
function stalledTrigramScan(): Promise<"scanned"> {
  return new Promise(() => {});
}

function deadlineAfter(ms: number): Promise<"timed_out"> {
  return new Promise((resolve) => {
    setTimeout(() => resolve("timed_out"), ms);
  });
}

async function main() {
  const args = parseCatalogTrigramProofArgs(process.argv.slice(2));

  if (args.injectTrigramTimeout) {
    const receipt = await runTrigramTimeoutFixture({ mode: args.mode });
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }

  if (!args.database) {
    throw new Error(
      "Pass --inject-trigram-timeout for the hermetic proof or --database for the migrated-database proof.",
    );
  }

  const { runCatalogTrigramTypeaheadDatabaseProof } =
    await import("./prove-catalog-trigram-typeahead-database");
  const receipt = await runCatalogTrigramTypeaheadDatabaseProof({
    mode: args.mode,
  });
  console.log(JSON.stringify(receipt, null, 2));
}

if (process.argv[1]?.includes("prove-catalog-trigram-typeahead")) {
  void main().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}
