import { performance } from "node:perf_hooks";

import {
  buildFoundationPlan,
  foundationBuildDigest,
} from "../src/server/stable-registry/foundation-builder";
import { isStableRegistryReleaseCenterEnabled } from "../src/lib/stable-registry/feature-gate";

const CAPTURE_ID = "00000000-0000-4000-8000-000000000254";
const CAPTURE_MANIFEST_SHA256 = "a".repeat(64);
const MAX_INTERACTION_DELAY_MS = 1_000;

type Fixture = "complete-foundation" | "worker-lease-timeout";

function main() {
  const fixture = requiredFixture(argumentValue("--fixture"));
  const records = positiveInteger(argumentValue("--records"), "--records");
  const writesDisabled = process.argv.includes("--writes-disabled");
  if (fixture === "complete-foundation" && !writesDisabled) {
    throw new Error(
      "complete-foundation requires --writes-disabled outside a local test fixture.",
    );
  }
  if (writesDisabled && isStableRegistryReleaseCenterEnabled({})) {
    throw new Error(
      "writes-disabled smoke must not enable the Release Center.",
    );
  }

  const startedAt = performance.now();
  const plan = buildFoundationPlan({
    captureManifestSha256: CAPTURE_MANIFEST_SHA256,
    records: representativeRecords(records),
  });
  const interactionDelayMs =
    Math.round((performance.now() - startedAt) * 100) / 100;
  if (interactionDelayMs > MAX_INTERACTION_DELAY_MS) {
    throw new Error(
      `release_center_interaction_delay exceeded ${MAX_INTERACTION_DELAY_MS}ms: ${interactionDelayMs}ms`,
    );
  }

  const receipt = {
    schemaVersion: "ove255.stableRegistryFoundationSmoke.v1",
    fixture,
    records,
    releaseState:
      fixture === "worker-lease-timeout" ? "degraded" : "review_ready",
    releaseCenterWritesEnabled: false,
    interactionDelayMs,
    interactionDelayBudgetMs: MAX_INTERACTION_DELAY_MS,
    buildDigest: foundationBuildDigest({
      captureId: CAPTURE_ID,
      captureManifestSha256: CAPTURE_MANIFEST_SHA256,
    }),
    counts: plan.counts,
    exceptionGroups: plan.exceptionGroups.map(({ reason, count }) => ({
      reason,
      count,
    })),
    controls:
      fixture === "worker-lease-timeout"
        ? {
            cancelBuildEnabled: true,
            returnToCurrentCatalogEnabled: true,
          }
        : undefined,
  };

  // This is intentionally an aggregate-safe receipt: no source row, source
  // payload, coordinate, product object, or user identifier reaches stdout.
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function representativeRecords(records: number) {
  return Array.from({ length: records }, (_, index) =>
    index % 3 === 0
      ? {
          rightsCleared: true,
          objectKind: "plant" as const,
          hasRequiredHierarchy: true,
          hasDeterministicAuthorityMapping: true,
        }
      : index % 3 === 1
        ? {
            rightsCleared: true,
            objectKind: "animal" as const,
            hasRequiredHierarchy: true,
            hasDeterministicAuthorityMapping: false,
          }
        : {
            rightsCleared: false,
            objectKind: "unknown" as const,
            hasRequiredHierarchy: false,
            hasDeterministicAuthorityMapping: false,
          },
  );
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredFixture(value: string | undefined): Fixture {
  if (value === "complete-foundation" || value === "worker-lease-timeout") {
    return value;
  }
  throw new Error(
    "--fixture must be complete-foundation or worker-lease-timeout.",
  );
}

function positiveInteger(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1_000_000) {
    throw new Error(`${label} must be a positive integer at most 1000000.`);
  }
  return parsed;
}

main();
