import { describe, expect, it } from "vitest";

import {
  CATALOG_TYPEAHEAD_RESPONSE_BUDGET_MS,
  parseLocales,
  requiredFixture,
  runMeilisearchTimeoutFixture,
  STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS,
} from "./smoke-stable-registry-product-selection";

const LOCALES = ["uk", "bg", "ru"] as const;

describe("OVE-257 product-selection smoke", () => {
  it("degrades to the canonical fallback when the derived index times out", async () => {
    await expect(
      runMeilisearchTimeoutFixture({
        records: STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS,
        locales: [...LOCALES],
      }),
    ).resolves.toMatchObject({
      mode: "fixture",
      status: "pass",
      // The picker reports the honest terminal class instead of an empty
      // `ready`, which would read as "this plant is not in the catalog".
      terminalClass: "degraded",
      canonicalFallbackUsed: true,
      typeaheadResponseBudgetMs: CATALOG_TYPEAHEAD_RESPONSE_BUDGET_MS,
      preciseLocationAbsent: true,
      forbiddenMarkersAbsent: true,
      controls: {
        retrySearchEnabled: true,
        continueWithUnknownEnabled: true,
      },
    });
  });

  it("keeps the response inside the interaction budget while degraded", async () => {
    const receipt = await runMeilisearchTimeoutFixture({
      records: STABLE_REGISTRY_OBSERVED_FIXTURE_RECORDS,
      locales: [...LOCALES],
    });

    expect(receipt.maxTypeaheadResponseTimeMs).toBeLessThanOrEqual(
      CATALOG_TYPEAHEAD_RESPONSE_BUDGET_MS,
    );
  });

  it("refuses a smaller corpus rather than relabeling it as observed scale", async () => {
    await expect(
      runMeilisearchTimeoutFixture({ records: 1, locales: [...LOCALES] }),
    ).rejects.toThrow("declared observed corpus scale");
  });

  it("requires the complete shared locale matrix", () => {
    expect(parseLocales("uk,bg,ru")).toEqual([...LOCALES]);
    expect(() => parseLocales("uk,bg")).toThrow("exactly uk,bg,ru");
    expect(() => parseLocales("uk,uk,ru")).toThrow("exactly uk,bg,ru");
  });

  it("accepts only the declared no-wedge fixture", () => {
    expect(requiredFixture("meilisearch-timeout")).toBe("meilisearch-timeout");
    expect(() => requiredFixture("something-else")).toThrow(
      "must be meilisearch-timeout",
    );
  });
});
