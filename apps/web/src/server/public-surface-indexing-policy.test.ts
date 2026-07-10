import { describe, expect, it } from "vitest";

import {
  evaluateNonDiscoveryRouteIndexability,
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

    expect(
      evaluatePublicSurfaceIndexability({ kind: "guide" }).isIndexable,
    ).toBe(true);
    expect(
      evaluatePublicSurfaceIndexability({ kind: "aeo_answer" }).isIndexable,
    ).toBe(true);
  });

  it("keeps the read-first public UGC feed out of indexing and sitemaps", () => {
    expect(
      evaluatePublicSurfaceIndexability({ kind: "public_feed" }),
    ).toMatchObject({
      value: "noindex",
      isIndexable: false,
      sitemapEligible: false,
      robots: { index: false, follow: false },
      reasons: ["public_feed_noindex"],
    });
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
      catalogStatus: "seeded",
      catalogSource: "ua_state_register",
    });
    const bodyThin = evaluatePublicSurfaceIndexability({
      kind: "topic_aggregation",
      entryCount: PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minPublicEntryCount,
      aggregateBodyLength:
        PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minAggregateBodyLength - 1,
      topicTrust: "curated",
    });
    const indexable = evaluatePublicSurfaceIndexability({
      kind: "variety_aggregation",
      entryCount: PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minPublicEntryCount,
      aggregateBodyLength:
        PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minAggregateBodyLength,
      catalogStatus: "seeded",
      catalogSource: "ua_state_register",
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

  it("requires aggregation source and topic trust before promotion", () => {
    const unsafeCatalog = evaluatePublicSurfaceIndexability({
      kind: "variety_aggregation",
      entryCount: PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minPublicEntryCount,
      aggregateBodyLength:
        PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minAggregateBodyLength,
      catalogStatus: "seeded",
      catalogSource: "internal_seed",
    });
    const curatedCatalog = evaluatePublicSurfaceIndexability({
      kind: "variety_aggregation",
      entryCount: PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minPublicEntryCount,
      aggregateBodyLength:
        PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minAggregateBodyLength,
      catalogStatus: "confirmed",
      catalogSource: "user_added",
    });
    const untrustedTopic = evaluatePublicSurfaceIndexability({
      kind: "topic_aggregation",
      entryCount: PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minPublicEntryCount,
      aggregateBodyLength:
        PUBLIC_AGGREGATION_INDEXABILITY_THRESHOLD.minAggregateBodyLength,
      topicTrust: "untrusted",
    });

    expect(unsafeCatalog).toMatchObject({
      value: "noindex",
      sitemapEligible: false,
      reasons: ["catalog_trust_below_threshold"],
    });
    expect(curatedCatalog.value).toBe("indexable");
    expect(untrustedTopic).toMatchObject({
      value: "noindex",
      sitemapEligible: false,
      reasons: ["topic_trust_below_threshold"],
    });
  });

  it("keeps object passport, profile, lineage graph, and missing public surfaces out of the index and sitemap", () => {
    for (const kind of [
      "object_passport",
      "profile",
      "lineage_graph",
      "missing",
    ] as const) {
      expect(evaluatePublicSurfaceIndexability({ kind })).toMatchObject({
        value: "noindex",
        isIndexable: false,
        sitemapEligible: false,
        robots: { index: false, follow: false },
      });
    }
  });

  it("keeps private workspace, auth, and operator routes out of organic discovery", () => {
    expect(evaluateNonDiscoveryRouteIndexability("workspace")).toMatchObject({
      value: "noindex",
      isIndexable: false,
      sitemapEligible: false,
      robots: { index: false, follow: false },
      reasons: ["workspace_route_noindex"],
    });
    expect(evaluateNonDiscoveryRouteIndexability("auth")).toMatchObject({
      value: "noindex",
      robots: { index: false, follow: false },
      reasons: ["auth_route_noindex"],
    });
    expect(evaluateNonDiscoveryRouteIndexability("operator")).toMatchObject({
      value: "noindex",
      robots: { index: false, follow: false },
      reasons: ["operator_route_noindex"],
    });
  });

  it("lists only static authored surfaces that the same policy marks sitemap-eligible", () => {
    expect(listStaticIndexablePublicSurfaces()).toEqual([]);
  });
});
