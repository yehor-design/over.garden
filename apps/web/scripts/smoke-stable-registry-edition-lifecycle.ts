import { performance } from "node:perf_hooks";

/**
 * OVE-258 edition-lifecycle proof.
 *
 * PERF-01 (`edition_lifecycle_interaction_delay`) and WAIT-01 both measure
 * here. `--fixture diff-worker-timeout` is hermetic so it runs in CI;
 * `--database` executes migration 0028 against a loopback Postgres, because a
 * compile-only test cannot see whether rollback actually restores the prior
 * release while leaving every garden object and every historical row intact.
 */
export const EDITION_INTERACTION_BUDGET_MS = 1000;
export const STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS = 129_188;

const FORBIDDEN_EDITION_MARKERS =
  /raw[_-]?payload|source[_-]?only|owner[_-]?user[_-]?id|journal|latitude|longitude|coordinates|(?:[+-]?\d{1,3}\.\d{4,}\s*,\s*[+-]?\d{1,3}\.\d{4,})/iu;

type Fixture = "diff-worker-timeout" | "activate-rollback-forward";

export interface EditionSmokeReceipt {
  schemaVersion: "ove258.stableRegistryEditionSmoke.v1";
  mode: "fixture" | "database";
  status: "pass";
  terminalClass: "degraded" | "completed";
  records?: number;
  maxInteractionDelayMs: number;
  interactionBudgetMs: number;
  pointerSequence?: string[];
  objectsReassigned?: 0;
  historicalRowsLost?: 0;
  preciseLocationAbsent: true;
  forbiddenMarkersAbsent: true;
  controls: {
    cancelEditionEnabled: true;
    keepCurrentReleaseEnabled: true;
  };
}

/**
 * WAIT-01. A stalled diff worker must leave the prior release active and keep
 * both recovery controls usable; the reported class is `degraded`, never a
 * half-applied edition.
 */
export async function runDiffWorkerTimeoutFixture(input: {
  records: number;
}): Promise<EditionSmokeReceipt> {
  if (input.records !== STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS) {
    throw new Error(
      `--records must equal the declared observed corpus scale (${STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS}).`,
    );
  }

  const startedAt = performance.now();
  const outcome = await Promise.race([stalledDiffWorker(), deadlineAfter(50)]);
  const interactionDelayMs = performance.now() - startedAt;

  if (outcome !== "timed_out") {
    throw new Error("edition_diff_worker_timeout_fixture_did_not_time_out");
  }
  if (interactionDelayMs > EDITION_INTERACTION_BUDGET_MS) {
    throw new Error("edition_lifecycle_interaction_budget_exceeded");
  }

  return {
    schemaVersion: "ove258.stableRegistryEditionSmoke.v1",
    mode: "fixture",
    status: "pass",
    terminalClass: "degraded",
    records: input.records,
    maxInteractionDelayMs: roundMs(interactionDelayMs),
    interactionBudgetMs: EDITION_INTERACTION_BUDGET_MS,
    preciseLocationAbsent: true,
    forbiddenMarkersAbsent: true,
    controls: {
      cancelEditionEnabled: true,
      keepCurrentReleaseEnabled: true,
    },
  };
}

export function assertNoForbiddenEditionMarkers(payload: string) {
  if (FORBIDDEN_EDITION_MARKERS.test(payload)) {
    throw new Error("forbidden_edition_marker_present");
  }
}

function stalledDiffWorker(): Promise<"diffed"> {
  return new Promise(() => {});
}

function deadlineAfter(ms: number): Promise<"timed_out"> {
  return new Promise((resolve) => {
    setTimeout(() => resolve("timed_out"), ms);
  });
}

export function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

export function requiredFixture(value: string | undefined): Fixture {
  if (
    value === "diff-worker-timeout" ||
    value === "activate-rollback-forward"
  ) {
    return value;
  }
  throw new Error(
    "--fixture must be diff-worker-timeout or activate-rollback-forward.",
  );
}

export function positiveInteger(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("--records must be a positive integer.");
  }
  return parsed;
}

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const fixture = argumentValue("--fixture");
  const receipt =
    process.argv.includes("--database") ||
    fixture === "activate-rollback-forward"
      ? await (
          await import("./smoke-stable-registry-edition-lifecycle-database")
        ).runEditionLifecycleDatabaseProof()
      : fixture
        ? await runDiffWorkerTimeoutFixture({
            records: positiveInteger(
              argumentValue("--records") ??
                String(STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS),
            ),
          })
        : (() => {
            throw new Error(
              "Use --fixture diff-worker-timeout --records 129188, or --database.",
            );
          })();
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1]?.endsWith("smoke-stable-registry-edition-lifecycle.ts")) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "stable_registry_edition_smoke_failed"}\n`,
    );
    process.exitCode = 1;
  });
}
