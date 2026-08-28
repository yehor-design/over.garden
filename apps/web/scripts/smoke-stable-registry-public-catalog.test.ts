import { describe, expect, it } from "vitest";

import {
  runRepositoryTimeoutFixture,
  STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS,
  STABLE_REGISTRY_PUBLIC_QUERY_BUDGET_MS,
} from "./smoke-stable-registry-public-catalog";

describe("OVE-256 Stable Registry public catalog smoke", () => {
  it("proves the observed-scale timeout fixture fails boundedly with recovery controls", async () => {
    await expect(
      runRepositoryTimeoutFixture(STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS),
    ).resolves.toMatchObject({
      mode: "fixture",
      status: "pass",
      records: STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS,
      queryBudgetMs: STABLE_REGISTRY_PUBLIC_QUERY_BUDGET_MS,
      preciseLocationAbsent: true,
      forbiddenMarkersAbsent: true,
      controls: {
        retrySearchEnabled: true,
        browseApprovedCatalogEnabled: true,
      },
    });
  });

  it("refuses a different corpus scale instead of relabeling a smaller fixture", async () => {
    await expect(runRepositoryTimeoutFixture(1)).rejects.toThrow(
      "declared observed corpus scale",
    );
  });
});
