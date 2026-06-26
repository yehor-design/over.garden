import { describe, expect, it } from "vitest";

import {
  evaluatePublicVarietyIndexState,
  PUBLIC_VARIETY_INDEXABILITY_THRESHOLD,
} from "./public-variety-indexing";

describe("public variety indexability threshold", () => {
  it("keeps pages noindex when public entry count is below the threshold", () => {
    const result = evaluatePublicVarietyIndexState({
      entryCount: PUBLIC_VARIETY_INDEXABILITY_THRESHOLD.minPublicEntryCount - 1,
      aggregateBodyLength:
        PUBLIC_VARIETY_INDEXABILITY_THRESHOLD.minAggregateBodyLength,
    });

    expect(result.value).toBe("noindex");
    expect(result.isIndexable).toBe(false);
    expect(result.reasons).toContain("entry_count_below_threshold");
  });

  it("keeps pages noindex when aggregate body text is below the threshold", () => {
    const result = evaluatePublicVarietyIndexState({
      entryCount: PUBLIC_VARIETY_INDEXABILITY_THRESHOLD.minPublicEntryCount,
      aggregateBodyLength:
        PUBLIC_VARIETY_INDEXABILITY_THRESHOLD.minAggregateBodyLength - 1,
    });

    expect(result.value).toBe("noindex");
    expect(result.isIndexable).toBe(false);
    expect(result.reasons).toContain("body_length_below_threshold");
  });

  it("promotes pages only when all proof thresholds pass", () => {
    const result = evaluatePublicVarietyIndexState({
      entryCount: PUBLIC_VARIETY_INDEXABILITY_THRESHOLD.minPublicEntryCount,
      aggregateBodyLength:
        PUBLIC_VARIETY_INDEXABILITY_THRESHOLD.minAggregateBodyLength,
    });

    expect(result.value).toBe("indexable");
    expect(result.isIndexable).toBe(true);
    expect(result.reasons).toEqual([]);
  });
});
