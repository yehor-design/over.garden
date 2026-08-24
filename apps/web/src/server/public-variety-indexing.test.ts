import { describe, expect, it } from "vitest";

import {
  evaluatePublicVarietyIndexState,
  PUBLIC_VARIETY_INDEXABILITY_THRESHOLD,
} from "./public-variety-indexing";
import type { PublicSurfaceDiscoverySource } from "./public-surface-discovery";

const EVALUATED_AT = "2026-08-24T00:00:00.000Z";

function source(
  overrides: Partial<PublicSurfaceDiscoverySource> = {},
): PublicSurfaceDiscoverySource & {
  consumerId: "public_variety_repository";
} {
  return {
    consumerId: "public_variety_repository",
    candidateState: "candidate",
    qualityClass: "partial",
    visibleText: [
      Array.from({ length: 120 }, (_, index) => `word${index}`).join(" "),
    ],
    distinctPublicEntityIds: ["catalog:plant_variety:tomato"],
    meaningfulContentAt: "2026-08-23T00:00:00.000Z",
    canonicalPath: "/variety/tomato",
    equivalentLocales: [],
    ...overrides,
  } as PublicSurfaceDiscoverySource & {
    consumerId: "public_variety_repository";
  };
}

describe("public variety indexability threshold", () => {
  it("uses the single public-surface threshold without catalog trust gates", () => {
    expect(PUBLIC_VARIETY_INDEXABILITY_THRESHOLD).toEqual({
      minimumQualityClass: "partial",
      minimumWordCount: 120,
      minimumDistinctEntities: 1,
      maximumStalenessDays: 540,
    });
    expect(
      evaluatePublicVarietyIndexState(source(), EVALUATED_AT),
    ).toMatchObject({
      value: "indexable",
      reasons: [],
    });
  });

  it("refuses thin, entity-free, and unverified projections deterministically", () => {
    const result = evaluatePublicVarietyIndexState(
      source({
        qualityClass: "unverified",
        visibleText: [
          Array.from({ length: 119 }, (_, index) => `word${index}`).join(" "),
        ],
        distinctPublicEntityIds: [],
      }),
      EVALUATED_AT,
    );

    expect(result).toMatchObject({
      value: "noindex",
      sitemapEligible: false,
      robots: { index: false, follow: false },
      reasons: [
        "quality_class_below_threshold",
        "word_count_below_threshold",
        "distinct_entity_count_below_threshold",
      ],
    });
  });
});
