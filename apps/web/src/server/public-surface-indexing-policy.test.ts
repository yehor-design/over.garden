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

  it("keeps an organism card without first-hand content reachable but noindex (ADR-0026 D9)", () => {
    const organism = candidate({
      surfaceKind: "variety_aggregation",
      canonicalPath: "/species/solanum-lycopersicum",
      equivalentLocales: ["uk", "bg", "ru"],
    });
    expect(
      evaluatePublicSurfaceIndexability({ ...organism, hasFirstHandContent: false }),
    ).toMatchObject({
      value: "noindex",
      sitemapEligible: false,
      robots: { index: false, follow: false },
      reasons: ["organism_without_first_hand_content"],
    });
    expect(
      evaluatePublicSurfaceIndexability({ ...organism, hasFirstHandContent: true }).isIndexable,
    ).toBe(true);
    expect(
      evaluatePublicSurfaceIndexability({ ...organism, hasFirstHandContent: null }).isIndexable,
    ).toBe(true);
    // The rule is the organism card's alone.
    expect(
      evaluatePublicSurfaceIndexability(candidate({ hasFirstHandContent: false })).isIndexable,
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

  it("lets a never-translated surface render in the reader's language and stay indexable", () => {
    // A gardener's entry has one address, unprefixed, and since OVE-460 the
    // locale subtree it renders from is the reader's language: the prefixed
    // spelling of that address still answers 308. Read as a duplicate, this
    // made every entry `noindex, nofollow` for a reader whose language was not
    // the default — measured on production within minutes of the deploy.
    for (const servedLocale of ["uk", "bg", "ru"] as const) {
      expect(
        evaluatePublicSurfaceIndexability(
          candidate({
            canonicalPath: "/@yehor/полив",
            equivalentLocales: [],
            servedLocale,
          }),
        ).isIndexable,
        servedLocale,
      ).toBe(true);
    }

    // A surface that does have a translated address is still a duplicate when
    // it is served under a prefix its canonical does not carry.
    expect(
      evaluatePublicSurfaceIndexability(
        candidate({
          canonicalPath: "/bg/journals",
          equivalentLocales: ["uk", "bg", "ru"],
          servedLocale: "ru",
        }),
      ).reasons,
    ).toEqual(["non_equivalent_locale"]);
    expect(
      evaluatePublicSurfaceIndexability(
        candidate({
          canonicalPath: "/bg/journals",
          equivalentLocales: ["uk", "bg", "ru"],
          servedLocale: "bg",
        }),
      ).isIndexable,
    ).toBe(true);
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
