import { describe, expect, it } from "vitest";

import {
  assertNoForbiddenEditionMarkers,
  EDITION_INTERACTION_BUDGET_MS,
  positiveInteger,
  requiredFixture,
  runDiffWorkerTimeoutFixture,
  STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS,
} from "./smoke-stable-registry-edition-lifecycle";

describe("OVE-258 edition lifecycle smoke", () => {
  it("keeps the prior release active when the diff worker stalls", async () => {
    await expect(
      runDiffWorkerTimeoutFixture({
        records: STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS,
      }),
    ).resolves.toMatchObject({
      mode: "fixture",
      status: "pass",
      // A stalled diff must never read as a half-applied edition.
      terminalClass: "degraded",
      interactionBudgetMs: EDITION_INTERACTION_BUDGET_MS,
      preciseLocationAbsent: true,
      forbiddenMarkersAbsent: true,
      controls: {
        cancelEditionEnabled: true,
        keepCurrentReleaseEnabled: true,
      },
    });
  });

  it("stays inside the owner interaction budget while degraded", async () => {
    const receipt = await runDiffWorkerTimeoutFixture({
      records: STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS,
    });
    expect(receipt.maxInteractionDelayMs).toBeLessThanOrEqual(
      EDITION_INTERACTION_BUDGET_MS,
    );
  });

  it("refuses a smaller corpus rather than relabeling it as observed scale", async () => {
    await expect(runDiffWorkerTimeoutFixture({ records: 1 })).rejects.toThrow(
      "declared observed corpus scale",
    );
  });

  it("accepts only the declared fixtures", () => {
    expect(requiredFixture("diff-worker-timeout")).toBe("diff-worker-timeout");
    expect(requiredFixture("activate-rollback-forward")).toBe(
      "activate-rollback-forward",
    );
    expect(() => requiredFixture("invented")).toThrow("--fixture must be");
    expect(() => positiveInteger("nope")).toThrow("positive integer");
  });

  it("refuses a receipt carrying user, journal, or location evidence", () => {
    for (const unsafe of [
      '{"note":"owner_user_id"}',
      '{"note":"journal body"}',
      '{"note":"49.8397, 24.0297"}',
    ]) {
      expect(() => assertNoForbiddenEditionMarkers(unsafe)).toThrow(
        "forbidden_edition_marker_present",
      );
    }
    expect(() =>
      assertNoForbiddenEditionMarkers('{"objectsReassigned":0}'),
    ).not.toThrow();
  });
});
