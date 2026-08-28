import { describe, expect, it } from "vitest";

import {
  assertNoForbiddenPackMarkers,
  EXTENSION_PACK_INTERACTION_BUDGET_MS,
  positiveInteger,
  requiredFixture,
  runWorkerTimeoutFixture,
  STABLE_REGISTRY_OBSERVED_FIXTURE_ROWS,
} from "./smoke-stable-registry-extension-pack";

describe("OVE-328 extension pack smoke", () => {
  it("holds only the affected pack when its worker stalls", async () => {
    await expect(
      runWorkerTimeoutFixture({ rows: STABLE_REGISTRY_OBSERVED_FIXTURE_ROWS }),
    ).resolves.toMatchObject({
      mode: "fixture",
      status: "pass",
      terminalClass: "degraded",
      interactionBudgetMs: EXTENSION_PACK_INTERACTION_BUDGET_MS,
      preciseLocationAbsent: true,
      forbiddenMarkersAbsent: true,
      controls: {
        cancelPackImportEnabled: true,
        returnToActiveCatalogEnabled: true,
      },
    });
  });

  it("keeps the owner interaction inside its budget while degraded", async () => {
    const receipt = await runWorkerTimeoutFixture({
      rows: STABLE_REGISTRY_OBSERVED_FIXTURE_ROWS,
    });
    expect(receipt.maxInteractionDelayMs).toBeLessThanOrEqual(
      EXTENSION_PACK_INTERACTION_BUDGET_MS,
    );
  });

  it("refuses a smaller corpus rather than relabeling it as observed scale", async () => {
    await expect(runWorkerTimeoutFixture({ rows: 1 })).rejects.toThrow(
      "declared observed corpus scale",
    );
  });

  it("accepts only the declared fixtures", () => {
    expect(requiredFixture("worker-timeout")).toBe("worker-timeout");
    expect(requiredFixture("approved-variety-and-breed")).toBe(
      "approved-variety-and-breed",
    );
    expect(() => requiredFixture("invented")).toThrow("--fixture must be");
    expect(() => positiveInteger("0")).toThrow("positive integer");
  });

  it("refuses a receipt that carries a forbidden source or location marker", () => {
    expect(() => assertNoForbiddenPackMarkers('{"note":"rawPayload"}')).toThrow(
      "forbidden_extension_pack_marker_present",
    );
    expect(() =>
      assertNoForbiddenPackMarkers('{"note":"49.8397, 24.0297"}'),
    ).toThrow("forbidden_extension_pack_marker_present");
    expect(() =>
      assertNoForbiddenPackMarkers('{"productEligibleRowCount":5}'),
    ).not.toThrow();
  });
});
