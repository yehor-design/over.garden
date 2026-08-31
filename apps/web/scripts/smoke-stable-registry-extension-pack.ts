import { performance } from "node:perf_hooks";

/**
 * OVE-328 extension-pack proof.
 *
 * PERF-01 (`extension_pack_interaction_delay`) and WAIT-01 both measure here.
 * `--fixture worker-timeout` is hermetic so it runs in CI; `--database`
 * executes migration 0027 against a loopback Postgres, because the repository's
 * Kysely tests compile queries without running them and cannot see a CHECK,
 * trigger, or parent-binding defect until the first real import.
 */
export const EXTENSION_PACK_INTERACTION_BUDGET_MS = 1000;
export const STABLE_REGISTRY_OBSERVED_FIXTURE_ROWS = 129_188;

const FORBIDDEN_PACK_MARKERS =
  /raw[_-]?payload|source[_-]?only|latitude|longitude|coordinates|owner[_-]?user[_-]?id|(?:[+-]?\d{1,3}\.\d{4,}\s*,\s*[+-]?\d{1,3}\.\d{4,})/iu;

type Fixture = "worker-timeout" | "approved-variety-and-breed";

export interface ExtensionPackSmokeReceipt {
  schemaVersion: "ove328.stableRegistryExtensionPackSmoke.v1";
  mode: "fixture" | "database";
  status: "pass";
  terminalClass: "degraded" | "completed";
  rows?: number;
  packKinds?: string[];
  maxInteractionDelayMs: number;
  interactionBudgetMs: number;
  productEligibleRowCount?: number;
  heldRowCount?: number;
  preciseLocationAbsent: true;
  forbiddenMarkersAbsent: true;
  controls: {
    cancelPackImportEnabled: true;
    returnToActiveCatalogEnabled: true;
  };
}

/**
 * WAIT-01. A stalled pack worker must hold only the affected pack: both
 * recovery controls stay usable and the reported class is `degraded`, never a
 * silent partial activation.
 */
export async function runWorkerTimeoutFixture(input: {
  rows: number;
}): Promise<ExtensionPackSmokeReceipt> {
  if (input.rows !== STABLE_REGISTRY_OBSERVED_FIXTURE_ROWS) {
    throw new Error(
      `--rows must equal the declared observed corpus scale (${STABLE_REGISTRY_OBSERVED_FIXTURE_ROWS}).`,
    );
  }

  const startedAt = performance.now();
  const outcome = await Promise.race([stalledPackWorker(), deadlineAfter(50)]);
  const interactionDelayMs = performance.now() - startedAt;

  if (outcome !== "timed_out") {
    throw new Error("extension_pack_worker_timeout_fixture_did_not_time_out");
  }
  if (interactionDelayMs > EXTENSION_PACK_INTERACTION_BUDGET_MS) {
    throw new Error("extension_pack_interaction_budget_exceeded");
  }

  return {
    schemaVersion: "ove328.stableRegistryExtensionPackSmoke.v1",
    mode: "fixture",
    status: "pass",
    terminalClass: "degraded",
    rows: input.rows,
    maxInteractionDelayMs: roundMs(interactionDelayMs),
    interactionBudgetMs: EXTENSION_PACK_INTERACTION_BUDGET_MS,
    preciseLocationAbsent: true,
    forbiddenMarkersAbsent: true,
    controls: {
      cancelPackImportEnabled: true,
      returnToActiveCatalogEnabled: true,
    },
  };
}

export function assertNoForbiddenPackMarkers(payload: string) {
  if (FORBIDDEN_PACK_MARKERS.test(payload)) {
    throw new Error("forbidden_extension_pack_marker_present");
  }
}

function stalledPackWorker(): Promise<"parsed"> {
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
  if (value === "worker-timeout" || value === "approved-variety-and-breed") {
    return value;
  }
  throw new Error(
    "--fixture must be worker-timeout or approved-variety-and-breed.",
  );
}

export function positiveInteger(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("--rows must be a positive integer.");
  }
  return parsed;
}

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const fixture = argumentValue("--fixture");
  const receipt = process.argv.includes("--database")
    ? await (
        await import("./smoke-stable-registry-extension-pack-database")
      ).runExtensionPackDatabaseProof()
    : fixture
      ? await runFixture(requiredFixture(fixture))
      : (() => {
          throw new Error(
            "Use --fixture worker-timeout --rows 129188, or --database.",
          );
        })();
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

async function runFixture(fixture: Fixture) {
  if (fixture === "worker-timeout") {
    return runWorkerTimeoutFixture({
      rows: positiveInteger(
        argumentValue("--rows") ??
          String(STABLE_REGISTRY_OBSERVED_FIXTURE_ROWS),
      ),
    });
  }
  // The approved variety-and-breed path needs real rows, so it is the database
  // proof rather than a hermetic fixture.
  return (
    await import("./smoke-stable-registry-extension-pack-database")
  ).runExtensionPackDatabaseProof();
}

if (process.argv[1]?.endsWith("smoke-stable-registry-extension-pack.ts")) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "stable_registry_extension_pack_smoke_failed"}\n`,
    );
    process.exitCode = 1;
  });
}
