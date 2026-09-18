import { describe, expect, it } from "vitest";

import {
  buildCommunityRemovalHref,
  buildPublicCommunityHref,
  communityFacts,
  isFirstRunCommunity,
  isUnfilteredCommunityViewRequest,
  normalizePublicCommunityViewRequest,
  EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST,
} from "./public-community-view";

const LABELS = { journals: "Записи", objects: "Живі об’єкти", members: "Учасники" };

describe("normalizePublicCommunityViewRequest", () => {
  it("reads the three parameters and refuses anything outside them", () => {
    expect(
      normalizePublicCommunityViewRequest({
        q: "  волога  ",
        kind: "plant",
        cursor: "eyJpZCI6IjEifQ",
      }),
    ).toEqual({ query: "волога", kind: "plant", cursor: "eyJpZCI6IjEifQ" });

    // `all` is the absence of the parameter, never a value it carries, so a
    // reader who types one gets the unfiltered listing rather than a second
    // address for it.
    expect(normalizePublicCommunityViewRequest({ kind: "all" }).kind).toBe(
      "all",
    );
    expect(normalizePublicCommunityViewRequest({ kind: "fungus" }).kind).toBe(
      "all",
    );
    expect(normalizePublicCommunityViewRequest({}).cursor).toBeNull();
  });

  it("bounds the query a reader can put in the address", () => {
    const request = normalizePublicCommunityViewRequest({
      q: "я".repeat(400),
    });
    expect(request.query).toHaveLength(100);
  });

  it("takes the first value when a parameter repeats", () => {
    expect(
      normalizePublicCommunityViewRequest({ kind: ["animal", "plant"] }).kind,
    ).toBe("animal");
  });
});

describe("buildPublicCommunityHref", () => {
  it("gives the unfiltered community exactly one address", () => {
    expect(
      buildPublicCommunityHref("uk", "observation-and-care", {
        query: "",
        kind: "all",
        cursor: null,
      }),
    ).toBe("/communities/observation-and-care");
    expect(
      buildPublicCommunityHref("bg", "observation-and-care"),
    ).toBe("/bg/communities/observation-and-care");
    expect(
      isUnfilteredCommunityViewRequest(EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST),
    ).toBe(true);
  });

  it("names each facet for itself and keeps the locale prefix", () => {
    expect(
      buildPublicCommunityHref("bg", "observation-and-care", {
        query: "домати",
        kind: "plant",
        cursor: "abc",
      }),
    ).toBe(
      "/bg/communities/observation-and-care?q=%D0%B4%D0%BE%D0%BC%D0%B0%D1%82%D0%B8&kind=plant&cursor=abc",
    );
  });

  it("drops the page when a filter is removed", () => {
    const request = {
      query: "домати",
      kind: "plant" as const,
      cursor: "page-4",
    };
    // Page four of a narrower listing is a different set of results, and
    // usually an empty one.
    expect(
      buildCommunityRemovalHref("uk", "observation-and-care", request, "kind"),
    ).toBe("/communities/observation-and-care?q=%D0%B4%D0%BE%D0%BC%D0%B0%D1%82%D0%B8");
    expect(
      buildCommunityRemovalHref("uk", "observation-and-care", request, "q"),
    ).toBe("/communities/observation-and-care?kind=plant");
  });
});

describe("communityFacts", () => {
  it("omits a count of zero rather than printing it", () => {
    // The whole of `OVE-454` criterion 1: the one community on the site
    // rendered `0 Записи · 0 Живі об'єкти · 0 Учасники` as its card footer.
    expect(
      communityFacts(
        {
          activeContributionCount: 0,
          activeObjectCount: 0,
          activeMemberCount: 0,
        },
        LABELS,
      ),
    ).toEqual([]);

    expect(
      communityFacts(
        {
          activeContributionCount: 14,
          activeObjectCount: 0,
          activeMemberCount: 17,
        },
        LABELS,
      ),
    ).toEqual([
      { key: "journals", label: "Записи", value: 14 },
      { key: "members", label: "Учасники", value: 17 },
    ]);
  });

  it("orders what a community has by what a reader came for", () => {
    expect(
      communityFacts(
        {
          activeContributionCount: 2,
          activeObjectCount: 3,
          activeMemberCount: 4,
        },
        LABELS,
      ).map((fact) => fact.key),
    ).toEqual(["journals", "objects", "members"]);
  });
});

describe("isFirstRunCommunity", () => {
  it("is the empty community, and never a filtered view of one", () => {
    expect(
      isFirstRunCommunity(
        { activeContributionCount: 0 },
        EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST,
      ),
    ).toBe(true);
    // Something may well exist and the filters excluded it — what that reader
    // needs is the filters they set and a way to clear them, not an
    // illustration and an invitation to write (DESIGN.md §5.4).
    expect(
      isFirstRunCommunity(
        { activeContributionCount: 0 },
        { query: "домати", kind: "all", cursor: null },
      ),
    ).toBe(false);
    expect(
      isFirstRunCommunity(
        { activeContributionCount: 3 },
        EMPTY_PUBLIC_COMMUNITY_VIEW_REQUEST,
      ),
    ).toBe(false);
  });
});
