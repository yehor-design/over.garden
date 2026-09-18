import { describe, expect, it } from "vitest";

import {
  buildListingHref,
  readListingFacet,
  RESERVED_LISTING_PARAMETERS,
} from "./public-listing-filters";
import {
  buildPublicJournalDirectoryHref,
  normalizePublicJournalDirectoryReturnTo,
} from "./public-journal-directory-navigation";
import type { PublicJournalDirectoryRequest } from "@/server/public-journal-directory-repository";

const unfiltered: PublicJournalDirectoryRequest = {
  query: "",
  kind: "all",
  catalog: null,
  topic: null,
  season: "all",
  region: null,
  sort: "recent",
  page: 1,
};

/* ── The URL vocabulary (OVE-448) ────────────────────────────────────────────
   One query parameter per facet, named for the facet, repeated for
   multi-select, plus `sort` and `page`. Absent means unset. No packed or
   encoded composite parameter. `OVE-451` builds the organism catalogue's
   addresses in the same vocabulary, so these are the assertions both pages
   answer to.
   ────────────────────────────────────────────────────────────────────────── */

describe("the listing URL vocabulary", () => {
  it("names each facet after itself, and nothing else", () => {
    expect(
      buildListingHref("/journals", {
        kind: "plant",
        topic: "winter-care",
        season: "summer",
      }),
    ).toBe("/journals?kind=plant&topic=winter-care&season=summer");
    // Not a packed parameter, which would make every consumer of the URL — a
    // crawler, an analytics report, a person editing a link — carry a decoder.
    expect(buildListingHref("/journals", { kind: "plant" })).not.toContain(
      "filters=",
    );
  });

  it("repeats a parameter for a multi-select facet, never comma-joins it", () => {
    const href = buildListingHref("/journals", {
      topic: ["winter-care", "pruning"],
    });
    expect(href).toBe("/journals?topic=winter-care&topic=pruning");
    // A comma is a legal character in a slug in some namespaces, so
    // "split on comma" is a bug waiting for the first one.
    expect(href).not.toContain(",");
    expect([...new URL(href, "https://x.test").searchParams.keys()]).toEqual([
      "topic",
      "topic",
    ]);
  });

  it("treats absent, empty and blank alike: the parameter is simply not there", () => {
    expect(
      buildListingHref("/journals", {
        kind: null,
        topic: undefined,
        season: "",
        region: "   ",
        extra: [],
      }),
    ).toBe("/journals");
  });

  it("reserves exactly two names that are not facets", () => {
    expect([...RESERVED_LISTING_PARAMETERS]).toEqual(["sort", "page"]);
    expect(buildListingHref("/journals", { sort: "oldest", page: 3 })).toBe(
      "/journals?sort=oldest&page=3",
    );
  });

  it("keeps the caller's order, so one view has one address", () => {
    // The cache, the canonical and the analytics report all key on the string.
    expect(buildListingHref("/j", { a: "1", b: "2" })).toBe("/j?a=1&b=2");
    expect(buildListingHref("/j", { b: "2", a: "1" })).toBe("/j?b=2&a=1");
  });

  it("reads a facet the same way whether the URL carried one value or several", () => {
    expect(readListingFacet("winter-care")).toEqual(["winter-care"]);
    expect(readListingFacet(["winter-care", "pruning"])).toEqual([
      "winter-care",
      "pruning",
    ]);
    expect(readListingFacet(undefined)).toEqual([]);
    // Blanks and duplicates are not values.
    expect(readListingFacet(["winter-care", "", "winter-care"])).toEqual([
      "winter-care",
    ]);
  });
});

describe("the journals directory's own addresses", () => {
  it("is the bare path when nothing is filtered", () => {
    expect(buildPublicJournalDirectoryHref("uk", unfiltered)).toBe("/journals");
    expect(buildPublicJournalDirectoryHref("bg", unfiltered)).toBe(
      "/bg/journals",
    );
  });

  it("writes one parameter per set facet, in the vocabulary's order", () => {
    expect(
      buildPublicJournalDirectoryHref("ru", {
        query: "томат",
        kind: "plant",
        catalog: "solanum-lycopersicum",
        topic: "winter-care",
        season: "summer",
        region: "UA-30",
        sort: "oldest",
        page: 2,
      }),
    ).toBe(
      "/ru/journals?q=%D1%82%D0%BE%D0%BC%D0%B0%D1%82&kind=plant" +
        "&catalog=solanum-lycopersicum&topic=winter-care&season=summer" +
        "&region=UA-30&sort=oldest&page=2",
    );
  });

  it("drops the default sort, and the default depends on the query", () => {
    // A search is ordered by relevance and a browse by recency, so writing the
    // default out would give one view two addresses.
    expect(
      buildPublicJournalDirectoryHref("uk", {
        ...unfiltered,
        query: "томат",
        sort: "relevance",
      }),
    ).toBe("/journals?q=%D1%82%D0%BE%D0%BC%D0%B0%D1%82");
    expect(
      buildPublicJournalDirectoryHref("uk", { ...unfiltered, sort: "recent" }),
    ).toBe("/journals");
    expect(
      buildPublicJournalDirectoryHref("uk", {
        ...unfiltered,
        sort: "relevance",
      }),
    ).toBe("/journals?sort=relevance");
  });

  it("drops page one, because page one is the listing", () => {
    expect(
      buildPublicJournalDirectoryHref("uk", { ...unfiltered, page: 1 }),
    ).toBe("/journals");
    expect(
      buildPublicJournalDirectoryHref("uk", { ...unfiltered, page: 4 }),
    ).toBe("/journals?page=4");
  });
});

describe("public journal directory return navigation", () => {
  it("keeps only the directory's own query keys", () => {
    expect(
      normalizePublicJournalDirectoryReturnTo(
        "/bg/journals?kind=plant&page=2&unknown=1",
        "uk",
      ),
    ).toBe("/bg/journals?kind=plant&page=2");
  });

  it("rejects external and unsupported return paths", () => {
    expect(
      normalizePublicJournalDirectoryReturnTo(
        "https://evil.example/journals",
        "ru",
      ),
    ).toBe("/ru/journals");
    expect(normalizePublicJournalDirectoryReturnTo("/garden?x=1", "bg")).toBe(
      "/bg/journals",
    );
  });
});
