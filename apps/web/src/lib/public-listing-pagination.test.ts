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
    expect(paginatedListingPageSize("/objects")).toBe(6);
    expect(paginatedListingPageSize("/bg/objects")).toBe(6);
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
    expect(paginatedListingRobotsTag("/bg/objects", page("7"))).toBe(
      "noindex, follow",
    );
    expect(paginatedListingRobotsTag("/journals", page())).toBeNull();
    expect(paginatedListingRobotsTag("/journals", page("1"))).toBeNull();
    expect(paginatedListingRobotsTag("/journals", page("abc"))).toBeNull();
    expect(paginatedListingRobotsTag("/feed", page("2"))).toBeNull();
    expect(paginatedListingRobotsTag("/topics/plants", page("2"))).toBeNull();
  });
});
