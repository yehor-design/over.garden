import { describe, expect, it } from "vitest";

import {
  normalizePublicProfilePage,
  normalizePublicProfileTab,
  publicProfileListHref,
  publicProfileTabHref,
} from "./public-profile-tabs";

describe("a profile's views (OVE-494)", () => {
  it("opens on the entries, and on the entries for anything it does not know", () => {
    expect(normalizePublicProfileTab(undefined)).toBe("entries");
    expect(normalizePublicProfileTab("objects")).toBe("objects");
    // The retired "about" tab and a tab nobody built land on the entries.
    expect(normalizePublicProfileTab("about")).toBe("entries");
    expect(normalizePublicProfileTab(["objects", "entries"])).toBe("objects");
  });

  it("reads a page number the way the route policy lets one through", () => {
    expect(normalizePublicProfilePage(undefined)).toBe(1);
    expect(normalizePublicProfilePage("2")).toBe(2);
    expect(normalizePublicProfilePage("1000")).toBe(1_000);
    for (const value of ["0", "-1", "1001", "2.5", "two", "02", ""]) {
      expect(normalizePublicProfilePage(value), value).toBe(1);
    }
  });

  it("writes the first tab and the first page as the bare address", () => {
    expect(publicProfileListHref("/@olena", "entries", 1)).toBe("/@olena");
    expect(publicProfileListHref("/bg/@olena", "entries", 3)).toBe(
      "/bg/@olena?page=3",
    );
    expect(publicProfileListHref("/@olena", "objects", 1)).toBe(
      "/@olena?tab=objects",
    );
    expect(publicProfileListHref("/@olena", "objects", 2)).toBe(
      "/@olena?tab=objects&page=2",
    );
    expect(publicProfileTabHref("/@olena", "objects", "#profile-objects")).toBe(
      "/@olena?tab=objects#profile-objects",
    );
  });
});
