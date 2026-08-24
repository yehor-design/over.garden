import { describe, expect, it } from "vitest";

import {
  evaluateNonDiscoveryRouteIndexability,
  evaluatePublicSurfaceIndexability,
  formatRobotsMetaContent,
  PUBLIC_SURFACE_INDEXABILITY_THRESHOLD,
  type PublicSurfaceCandidateInput,
} from "./public-surface-indexing-policy";

const EVALUATED_AT = "2026-08-24T00:00:00.000Z";

function candidate(
  overrides: Partial<PublicSurfaceCandidateInput> = {},
): PublicSurfaceCandidateInput {
  return {
    candidateState: "candidate",
    qualityClass: "partial",
    visibleWordCount: 120,
    distinctPublicEntityIds: ["plant-1", "plant-1"],
    meaningfulContentAt: "2025-03-02T00:00:00.000Z",
    canonicalPath: "/journal/season-note",
    equivalentLocales: ["uk"],
    surfaceKind: "journal_entry",
    ...overrides,
  };
}

describe("public surface indexing policy", () => {
  it("admits a candidate exactly on every inclusive threshold boundary", () => {
    const state = evaluatePublicSurfaceIndexability(candidate(), {
      evaluatedAt: EVALUATED_AT,
    });

    expect(PUBLIC_SURFACE_INDEXABILITY_THRESHOLD).toEqual({
      minimumQualityClass: "partial",
      minimumWordCount: 120,
      minimumDistinctEntities: 1,
      maximumStalenessDays: 540,
    });
    expect(state).toMatchObject({
      value: "indexable",
      isIndexable: true,
      sitemapEligible: true,
      robots: { index: true, follow: true },
      reasons: [],
    });
    expect(formatRobotsMetaContent(state)).toBe("index, follow");
  });

  it("returns every failed measured member in deterministic order", () => {
    const state = evaluatePublicSurfaceIndexability(
      candidate({
        qualityClass: "unverified",
        visibleWordCount: 119,
        distinctPublicEntityIds: [],
        meaningfulContentAt: "2025-03-01T00:00:00.000Z",
      }),
      { evaluatedAt: EVALUATED_AT },
    );

    expect(state).toMatchObject({
      value: "noindex",
      isIndexable: false,
      sitemapEligible: false,
      robots: { index: false, follow: false },
      reasons: [
        "quality_class_below_threshold",
        "word_count_below_threshold",
        "distinct_entity_count_below_threshold",
        "surface_stale",
      ],
    });
  });

  it("treats invalid or missing measured input as one unresolved refusal", () => {
    for (const input of [
      candidate({ meaningfulContentAt: null }),
      candidate({ meaningfulContentAt: "not-a-date" }),
      candidate({ qualityClass: null }),
      candidate({ visibleWordCount: Number.NaN }),
      candidate({ canonicalPath: "" }),
      candidate({ equivalentLocales: null }),
    ]) {
      expect(
        evaluatePublicSurfaceIndexability(input, {
          evaluatedAt: EVALUATED_AT,
        }),
      ).toMatchObject({
        value: "noindex",
        reasons: ["candidate_input_unresolved"],
      });
    }
  });

  it("keeps lifecycle refusals outside the measured threshold", () => {
    expect(
      evaluatePublicSurfaceIndexability(
        candidate({
          candidateState: "not_public_candidate",
          qualityClass: null,
          visibleWordCount: null,
          distinctPublicEntityIds: null,
          meaningfulContentAt: null,
          canonicalPath: null,
          equivalentLocales: null,
        }),
        { evaluatedAt: EVALUATED_AT },
      ),
    ).toMatchObject({
      value: "noindex",
      reasons: ["not_public_candidate"],
    });

    expect(
      evaluatePublicSurfaceIndexability(
        candidate({
          candidateState: "candidate_input_unresolved",
          qualityClass: null,
          visibleWordCount: null,
          distinctPublicEntityIds: null,
          meaningfulContentAt: null,
          canonicalPath: null,
          equivalentLocales: null,
        }),
        { evaluatedAt: EVALUATED_AT },
      ),
    ).toMatchObject({
      value: "noindex",
      reasons: ["candidate_input_unresolved"],
    });
  });

  it("preserves explicit non-discovery route controls", () => {
    expect(evaluateNonDiscoveryRouteIndexability("workspace").reasons).toEqual([
      "workspace_route_noindex",
    ]);
    expect(evaluateNonDiscoveryRouteIndexability("auth").reasons).toEqual([
      "auth_route_noindex",
    ]);
    expect(evaluateNonDiscoveryRouteIndexability("operator").reasons).toEqual([
      "operator_route_noindex",
    ]);
  });
});
