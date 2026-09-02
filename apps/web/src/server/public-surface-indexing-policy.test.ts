import { describe, expect, it } from "vitest";

import {
  evaluateNonDiscoveryRouteIndexability,
  evaluatePublicSurfaceIndexability,
  formatRobotsMetaContent,
  type PublicSurfaceCandidateInput,
} from "./public-surface-indexing-policy";

function candidate(
  overrides: Partial<PublicSurfaceCandidateInput> = {},
): PublicSurfaceCandidateInput {
  return {
    candidateState: "candidate",
    hasContent: true,
    canonicalPath: "/bg/journal/first-frost",
    equivalentLocales: ["bg", "ru"],
    surfaceKind: "journal_entry",
    ...overrides,
  };
}

describe("public surface indexability (ADR-0022, D3)", () => {
  it("indexes every live public page that has content", () => {
    const state = evaluatePublicSurfaceIndexability(candidate());
    expect(state).toMatchObject({
      value: "indexable",
      isIndexable: true,
      sitemapEligible: true,
      robots: { index: true, follow: true },
      reasons: [],
    });
    expect(formatRobotsMetaContent(state)).toBe("index, follow");
    expect(
      evaluatePublicSurfaceIndexability(
        candidate({
          canonicalPath: "/journal/first-frost",
          equivalentLocales: [],
        }),
      ).isIndexable,
    ).toBe(true);
  });

  it("refuses only an empty listing, a gone or non-public record, or an unresolved load", () => {
    expect(
      evaluatePublicSurfaceIndexability(candidate({ hasContent: false })),
    ).toMatchObject({ value: "noindex", reasons: ["empty_listing"] });
    expect(
      evaluatePublicSurfaceIndexability(
        candidate({ candidateState: "not_public_candidate" }),
      ).reasons,
    ).toEqual(["not_public_candidate"]);
    expect(
      evaluatePublicSurfaceIndexability(
        candidate({ candidateState: "candidate_input_unresolved" }),
      ).reasons,
    ).toEqual(["candidate_input_unresolved"]);
    for (const broken of [
      { hasContent: null },
      { canonicalPath: null },
      { canonicalPath: "/bg/journal/x?y" },
      { equivalentLocales: null },
      { equivalentLocales: ["bg", "bg"] as const },
    ]) {
      expect(
        evaluatePublicSurfaceIndexability(candidate(broken)).reasons,
        JSON.stringify(broken),
      ).toEqual(["candidate_input_unresolved"]);
    }
  });

  it("keeps a canonical path outside its declared locale set out of the index", () => {
    expect(
      evaluatePublicSurfaceIndexability(
        candidate({ canonicalPath: "/journal/x", equivalentLocales: ["bg"] }),
      ).reasons,
    ).toEqual(["non_equivalent_locale"]);
  });

  it("preserves explicit non-discovery route controls", () => {
    expect(evaluateNonDiscoveryRouteIndexability("workspace").reasons).toEqual([
      "workspace_route_noindex",
    ]);
    expect(evaluateNonDiscoveryRouteIndexability("auth").reasons).toEqual([
      "auth_route_noindex",
    ]);
    expect(
      formatRobotsMetaContent(evaluateNonDiscoveryRouteIndexability("operator")),
    ).toBe("noindex, nofollow");
  });
});
