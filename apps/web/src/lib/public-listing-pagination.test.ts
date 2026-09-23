import { describe, expect, it } from "vitest";

import {
  paginatedListingPageSize,
  paginatedListingRobotsTag,
  requestedListingPage,
} from "./public-listing-pagination";

describe("bounded listing pagination (ADR-0029 D3)", () => {
  it("knows which listings paginate, prefixed or not", () => {
    expect(paginatedListingPageSize("/journals")).toBe(8);
    expect(paginatedListingPageSize("/bg/journals")).toBe(8);
    expect(paginatedListingPageSize("/ru/journals/")).toBe(8);
    // `/objects` was the second catalogue door and now 308s to the one
    // (`OVE-451`); the catalogue bounds its own pages, because it knows its
    // own count and the journal-entry bound would 404 page two of 1 694.
    expect(paginatedListingPageSize("/objects")).toBeNull();
    expect(paginatedListingPageSize("/catalog")).toBeNull();
  });

  it("says nothing about a page that is not a listing", () => {
    for (const path of ["/", "/bg", "/feed", "/journal/polyv", "/topics/plants"]) {
      expect(paginatedListingPageSize(path), path).toBeNull();
    }
  });

  /**
   * Page one needs no bound, so nothing that resolves to page one should cost
   * a database read — including every malformed value, which the listing
   * already reads as page one.
   */
  it("only reports a page past the first", () => {
    for (const value of ["", "1", "0", "-3", "abc", "2.5", "1e3", " 2"]) {
      expect(
        requestedListingPage(new URLSearchParams(value ? { page: value } : {})),
        value,
      ).toBeNull();
    }
    expect(requestedListingPage(new URLSearchParams({ page: "2" }))).toBe(2);
    expect(requestedListingPage(new URLSearchParams({ page: "999" }))).toBe(999);
  });

  /**
   * A self-referencing canonical is what page two should carry, and this
   * architecture cannot deliver one — see the note on
   * `paginatedListingRobotsTag`. `noindex, follow` closes the same hole and
   * is a header, so it reaches the reader before anything streams.
   */
  it("keeps a paginated view out of the index and its entries reachable", () => {
    const page = (value?: string) =>
      new URLSearchParams(value ? { page: value } : {});
    expect(paginatedListingRobotsTag("/journals", page("2"))).toBe(
      "noindex, follow",
    );
    expect(paginatedListingRobotsTag("/bg/catalog", page("7"))).toBe(
      "noindex, follow",
    );
    expect(paginatedListingRobotsTag("/journals", page())).toBeNull();
    expect(paginatedListingRobotsTag("/journals", page("1"))).toBeNull();
    expect(paginatedListingRobotsTag("/journals", page("abc"))).toBeNull();
    expect(paginatedListingRobotsTag("/feed", page("2"))).toBeNull();
    expect(paginatedListingRobotsTag("/topics/plants", page("2"))).toBeNull();
  });

  it("keeps a profile's later pages out of the index too (OVE-494)", () => {
    const page = (value?: string) =>
      new URLSearchParams(value ? { page: value } : {});
    expect(paginatedListingRobotsTag("/@olena", page("2"))).toBe(
      "noindex, follow",
    );
    expect(paginatedListingRobotsTag("/bg/@olena", page("3"))).toBe(
      "noindex, follow",
    );
    expect(paginatedListingRobotsTag("/@olena", page())).toBeNull();
    expect(paginatedListingRobotsTag("/@olena", page("1"))).toBeNull();
    // An entry or a passport under the handle is not the profile's list.
    expect(paginatedListingRobotsTag("/@olena/post/3", page("2"))).toBeNull();
  });
});

describe("a filtered view of the catalogue's one door (OVE-451)", () => {
  // Every facet narrows one listing; every one of those views carries
  // `/catalog` as its canonical, and a filter nobody has filed anything under
  // is an empty listing. `follow` keeps every organism it lists reachable.
  it("is noindex, follow whichever facet it carries", () => {
    for (const search of [
      "kingdom=plantae",
      "kingdom=plantae&letter=s",
      "kingdom=plantae&letter=s&page=4",
      "rank=cultivar",
      "register=ua",
      "grown=1",
      "q=solanum",
      "sort=written",
      "page=2",
    ]) {
      expect(
        paginatedListingRobotsTag("/catalog", new URLSearchParams(search)),
        search,
      ).toBe("noindex, follow");
    }
    for (const path of ["/bg/catalog", "/ru/catalog"]) {
      expect(
        paginatedListingRobotsTag(path, new URLSearchParams("kingdom=fungi")),
        path,
      ).toBe("noindex, follow");
    }
  });

  it("leaves the one door itself alone", () => {
    expect(paginatedListingRobotsTag("/catalog", new URLSearchParams())).toBeNull();
    expect(
      paginatedListingRobotsTag("/catalog", new URLSearchParams("kingdom=")),
    ).toBeNull();
    // An organism page is not a view of the listing.
    expect(
      paginatedListingRobotsTag(
        "/species/solanum-lycopersicum",
        new URLSearchParams("kingdom=plantae"),
      ),
    ).toBeNull();
  });
});
