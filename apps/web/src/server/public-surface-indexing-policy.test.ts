import { describe, expect, it } from "vitest";

import {
  evaluatePublicSurfaceIndexability,
  formatRobotsMetaContent,
  listStaticIndexablePublicSurfaces,
  PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD,
} from "./public-surface-indexing-policy";

describe("public surface indexing policy", () => {
  it("allows authored useful landing and SEO/AEO surfaces to be indexed", () => {
    expect(
      evaluatePublicSurfaceIndexability({ kind: "marketing_landing" }),
    ).toMatchObject({
      value: "indexable",
      isIndexable: true,
      sitemapEligible: true,
      robots: { index: true, follow: true },
      reasons: ["authored_useful_surface"],
    });

    expect(evaluatePublicSurfaceIndexability({ kind: "guide" }).isIndexable)
      .toBe(true);
    expect(evaluatePublicSurfaceIndexability({ kind: "aeo_answer" }).isIndexable)
      .toBe(true);
  });

  it("keeps public journal entries noindex until the entry is explicitly promoted", () => {
    const noindex = evaluatePublicSurfaceIndexability({
      kind: "journal_entry",
      publicNoindex: true,
    });
    const indexable = evaluatePublicSurfaceIndexability({
      kind: "journal_entry",
      publicNoindex: false,
    });

    expect(noindex).toMatchObject({
      value: "noindex",
      sitemapEligible: false,
      robots: { index: false, follow: false },
      reasons: ["journal_marked_noindex"],
    });
    expect(formatRobotsMetaContent(noindex)).toBe("noindex, nofollow");
    expect(indexable).toMatchObject({
      value: "indexable",
      sitemapEligible: true,
      robots: { index: true, follow: true },
    });
  });

  it("requires public aggregation pages to pass all content quality thresholds", () => {
    const entryThin = evaluatePublicSurfaceIndexability({
      kind: "variety_aggregation",
      entryCount:
        PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minPublicEntryCount - 1,
      aggregateBodyLength:
        PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minAggregateBodyLength,
    });
    const bodyThin = evaluatePublicSurfaceIndexability({
      kind: "topic_aggregation",
      entryCount: PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minPublicEntryCount,
      aggregateBodyLength:
        PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minAggregateBodyLength - 1,
    });
    const indexable = evaluatePublicSurfaceIndexability({
      kind: "variety_aggregation",
      entryCount: PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minPublicEntryCount,
      aggregateBodyLength:
        PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minAggregateBodyLength,
    });

    expect(entryThin.value).toBe("noindex");
    expect(entryThin.reasons).toContain("entry_count_below_threshold");
    expect(bodyThin.value).toBe("noindex");
    expect(bodyThin.reasons).toContain("body_length_below_threshold");
    expect(indexable).toMatchObject({
      value: "indexable",
      sitemapEligible: true,
      reasons: [],
    });
  });

  it("keeps profile, lineage graph, and missing public surfaces out of the index and sitemap", () => {
    for (const kind of ["profile", "lineage_graph", "missing"] as const) {
      expect(evaluatePublicSurfaceIndexability({ kind })).toMatchObject({
        value: "noindex",
        isIndexable: false,
        sitemapEligible: false,
        robots: { index: false, follow: false },
      });
    }
  });

  it("lists only static authored surfaces that the same policy marks sitemap-eligible", () => {
    expect(listStaticIndexablePublicSurfaces()).toEqual([
      {
        kind: "marketing_landing",
        path: "/",
        changeFrequency: "weekly",
        priority: 0.8,
      },
    ]);
  });
});
