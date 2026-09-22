import { describe, expect, it } from "vitest";

import {
  formatLastEntry,
  gardenCollectionHref,
  gardenCollectionItemAnchor,
  gardenCollectionItemHref,
  gardenCollectionWriteHref,
  isDefaultGardenCollectionRequest,
  normalizeGardenCollectionRequest,
} from "./garden-collection";

const DEFAULT = normalizeGardenCollectionRequest({});

describe("the collection's address (OVE-489)", () => {
  it("reads a bounded query, a closed order and mode, and a sane page", () => {
    expect(DEFAULT).toEqual({ q: "", sort: "recent", kind: "all", page: 1 });
    expect(isDefaultGardenCollectionRequest(DEFAULT)).toBe(true);
    expect(
      normalizeGardenCollectionRequest({
        q: ["  Томат\u0000\n  чері ", "ignored"],
        sort: "name",
        kind: "space",
        page: "7",
      }),
    ).toEqual({ q: "Томат чері", sort: "name", kind: "space", page: 7 });
    expect(
      normalizeGardenCollectionRequest({ q: "x".repeat(500) }).q,
    ).toHaveLength(120);
    for (const page of ["0", "-3", "2.5", "abc", "99999999999"]) {
      expect(normalizeGardenCollectionRequest({ page }).page).toBe(1);
    }
    expect(normalizeGardenCollectionRequest({ page: "999999" }).page).toBe(
      10_000,
    );
    expect(normalizeGardenCollectionRequest({ sort: "oldest" }).sort).toBe(
      "recent",
    );
    expect(normalizeGardenCollectionRequest({ kind: "catalogue" }).kind).toBe(
      "all",
    );
  });

  it("writes a view back without its defaults, so one view has one address", () => {
    expect(gardenCollectionHref(DEFAULT)).toBe("/garden#garden-collection");
    expect(gardenCollectionHref(DEFAULT, {}, "")).toBe("/garden");
    expect(
      gardenCollectionHref(DEFAULT, {
        q: "томат",
        sort: "name",
        kind: "object",
        page: 3,
      }),
    ).toBe(
      "/garden?q=%D1%82%D0%BE%D0%BC%D0%B0%D1%82&sort=name&kind=object&page=3#garden-collection",
    );
  });

  it("sends Write to the one composer with the destination named and the row to return to", () => {
    const request = { ...DEFAULT, q: "tomato", page: 2 };
    const href = gardenCollectionWriteHref({ kind: "object", id: "o-1" }, request);
    const url = new URL(href, "https://over.garden");
    expect(url.pathname).toBe("/garden/new");
    expect(url.searchParams.get("object")).toBe("o-1");
    expect(url.searchParams.get("returnTo")).toBe(
      "/garden?q=tomato&page=2#garden-object-o-1",
    );
    expect(
      new URL(
        gardenCollectionWriteHref({ kind: "space", id: "s-1" }, DEFAULT),
        "https://over.garden",
      ).searchParams.get("space"),
    ).toBe("s-1");
    expect(gardenCollectionItemAnchor({ kind: "space", id: "s-1" })).toBe(
      "garden-space-s-1",
    );
    expect(gardenCollectionItemHref({ kind: "object", id: "o-1" })).toBe(
      "/garden/objects/o-1",
    );
    expect(gardenCollectionItemHref({ kind: "space", id: "s-1" })).toBe(
      "/garden?space=s-1#space-journal",
    );
  });
});

describe("last entry, stated as a date and never as a diagnosis", () => {
  it("says when, in the reader's language", () => {
    const today = "2026-09-23";
    expect(formatLastEntry("2026-09-23", today, "uk")).toBe("сьогодні");
    expect(formatLastEntry("2026-09-22", today, "uk")).toBe("учора");
    expect(formatLastEntry("2026-09-20", today, "uk")).toBe("3 дні тому");
    expect(formatLastEntry("2026-09-02", today, "uk")).toBe("3 тижні тому");
    expect(formatLastEntry("2026-06-23", today, "bg")).toBe("преди 3 месеца");
    expect(formatLastEntry("2024-09-23", today, "ru")).toBe("2 года назад");
    // A date after "today" (the reader's day ahead of the server's) is today.
    expect(formatLastEntry("2026-09-24", today, "uk")).toBe("сьогодні");
  });
});
