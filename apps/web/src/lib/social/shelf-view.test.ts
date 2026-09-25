import { describe, expect, it } from "vitest";

import {
  readShelfOutcome,
  shelfOutcomeHref,
  shelfRowAnchor,
  shelfViewPath,
} from "./shelf-view";

const ENTRY = "10000000-0000-4000-8000-0000000000e1";
const OBJECT = "c0ffee00-0000-4000-8000-000000000101";

/** The query of an address, as a page's `searchParams` would hold it. */
function queryOf(href: string) {
  return Object.fromEntries(new URL(href, "https://over.garden").searchParams);
}

describe("the view a shelf action comes back to (OVE-502)", () => {
  it.each([
    ["bookmarks", "uk", "/bookmarks?kind=journal_entry&page=2"],
    ["bookmarks", "bg", "/bg/bookmarks?kind=variety"],
    ["bookmarks", "ru", "/ru/bookmarks?page=3"],
  ] as const)(
    "keeps the %s view it was pressed in, in %s",
    (shelf, locale, view) => {
      expect(shelfViewPath(shelf, view, locale)).toBe(view);
    },
  );

  it("keeps the filter and the page, and nothing else", () => {
    // A stale outcome from the previous press, a foreign parameter and a
    // fragment all drop out; the two the shelf reads stay, in its own order.
    expect(
      shelfViewPath(
        "bookmarks",
        `/bookmarks?page=2&outcome=removed&action=remove&target=variety%3Aa&token=opaque&kind=topic#saved-variety-a`,
        "uk",
      ),
    ).toBe("/bookmarks?kind=topic&page=2");
    expect(shelfViewPath("bookmarks", "/bg/bookmarks?token=opaque", "bg")).toBe(
      "/bg/bookmarks",
    );
  });

  it("drops a value it would not put in an address, and keeps the rest", () => {
    expect(
      shelfViewPath("bookmarks", "/bookmarks?kind=%3Cscript%3E&page=2", "uk"),
    ).toBe("/bookmarks?page=2");
    expect(
      shelfViewPath("bookmarks", "/bookmarks?kind=topic&page=1%200", "uk"),
    ).toBe("/bookmarks?kind=topic");
    expect(
      shelfViewPath("bookmarks", `/bookmarks?kind=${"a".repeat(41)}`, "uk"),
    ).toBe("/bookmarks");
    expect(
      shelfViewPath("bookmarks", `/bookmarks?kind=${"a".repeat(40)}`, "uk"),
    ).toBe(`/bookmarks?kind=${"a".repeat(40)}`);
    expect(shelfViewPath("bookmarks", "/bookmarks?kind=&page=", "uk")).toBe(
      "/bookmarks",
    );
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example/bookmarks",
    "//evil.example/bookmarks",
    "/\\evil.example/bookmarks",
    "/%2fevil.example/bookmarks",
    // The retired wishlist's address (ADR-0033) is somewhere else.
    "/wishlist?kind=species",
    "/garden?kind=variety",
    "/bookmarks/extra",
    "/bookmarks-and-more",
    "/bookmarks/../garden",
    "bookmarks",
  ])("falls back to the shelf itself from %s", (value) => {
    expect(shelfViewPath("bookmarks", value, "bg")).toBe("/bg/bookmarks");
    expect(shelfViewPath("bookmarks", value, "uk")).toBe("/bookmarks");
  });

  it("falls back from a form field that is a file, not a path", () => {
    expect(
      shelfViewPath("bookmarks", new File(["/bookmarks"], "view.txt"), "ru"),
    ).toBe("/ru/bookmarks");
  });

  it("never lands an answer on another page's address", () => {
    expect(shelfViewPath("bookmarks", "/ru/notifications?page=2", "ru")).toBe(
      "/ru/bookmarks",
    );
  });
});

describe("what a shelf action says when it gets back (OVE-502)", () => {
  it("lands a removal nowhere in particular: its row is gone, and a toast says it", () => {
    expect(
      shelfOutcomeHref("/bg/bookmarks?kind=journal_entry&page=2", {
        outcome: "removed",
        action: "remove",
        target: `journal_entry:${ENTRY}`,
      }),
    ).toBe(
      `/bg/bookmarks?kind=journal_entry&page=2&outcome=removed&action=remove&target=journal_entry%3A${ENTRY}`,
    );
    // Not even a fragment the view carried: it named a row that is gone.
    expect(
      shelfOutcomeHref(`/bookmarks#saved-lineage_object-${OBJECT}`, {
        outcome: "removed",
        action: "remove",
        target: `lineage_object:${OBJECT}`,
      }),
    ).toBe(
      `/bookmarks?outcome=removed&action=remove&target=lineage_object%3A${OBJECT}`,
    );
  });

  it("lands a refused Undo on the notice above the list, because its row is not there", () => {
    expect(
      shelfOutcomeHref("/bookmarks?kind=variety", {
        outcome: "failed",
        action: "restore",
        target: "variety:pomidor-cheri-0000000101",
      }),
    ).toBe(
      "/bookmarks?kind=variety&outcome=failed&action=restore&target=variety%3Apomidor-cheri-0000000101#shelf-outcome",
    );
    expect(
      shelfOutcomeHref("/ru/bookmarks", {
        outcome: "failed",
        action: "restore",
        target: `lineage_object:${OBJECT}`,
      }),
    ).toBe(
      `/ru/bookmarks?outcome=failed&action=restore&target=lineage_object%3A${OBJECT}#shelf-outcome`,
    );
  });

  it("lands a restore and a refused removal on the row they concern, which is on the shelf", () => {
    expect(
      shelfOutcomeHref("/bookmarks?kind=variety", {
        outcome: "restored",
        action: "restore",
        target: "variety:pomidor-cheri-0000000101",
      }),
    ).toBe(
      "/bookmarks?kind=variety&outcome=restored&action=restore&target=variety%3Apomidor-cheri-0000000101#saved-variety-pomidor-cheri-0000000101",
    );
    expect(
      shelfOutcomeHref("/ru/bookmarks?page=2", {
        outcome: "failed",
        action: "remove",
        target: `lineage_object:${OBJECT}`,
      }),
    ).toBe(
      `/ru/bookmarks?page=2&outcome=failed&action=remove&target=lineage_object%3A${OBJECT}#saved-lineage_object-${OBJECT}`,
    );
  });

  it("replaces an outcome the view already carried rather than adding a second", () => {
    const href = shelfOutcomeHref(
      "/bookmarks?outcome=removed&action=remove&target=stale",
      { outcome: "restored", action: "restore", target: `topic:${OBJECT}` },
    );
    const query = new URL(href, "https://over.garden").searchParams;

    expect(query.getAll("outcome")).toEqual(["restored"]);
    expect(query.getAll("action")).toEqual(["restore"]);
    expect(query.getAll("target")).toEqual([`topic:${OBJECT}`]);
  });

  it("names a row by the same target an outcome names", () => {
    expect(shelfRowAnchor(`journal_entry:${ENTRY}`)).toBe(
      `saved-journal_entry-${ENTRY}`,
    );
    expect(shelfRowAnchor("variety:pomidor-cheri-0000000101")).toBe(
      "saved-variety-pomidor-cheri-0000000101",
    );
    // Whatever arrives, the id is one a fragment can name.
    expect(shelfRowAnchor('a.b c/d"<x>')).toMatch(/^saved-[A-Za-z0-9_-]+$/u);
  });

  it.each([
    ["removed", "remove", `journal_entry:${ENTRY}`],
    ["restored", "restore", "variety:pomidor-cheri-0000000101"],
    ["failed", "restore", "topic:tomaty"],
    ["failed", "remove", `lineage_object:${ENTRY}`],
  ] as const)(
    "reads back the %s outcome of %s it wrote",
    (outcome, action, target) => {
      const href = shelfOutcomeHref("/bg/bookmarks?kind=topic", {
        outcome,
        action,
        target,
      });

      expect(readShelfOutcome(queryOf(href))).toEqual({
        outcome,
        action,
        target,
      });
    },
  );

  it("reads the first of a repeated parameter", () => {
    expect(
      readShelfOutcome({
        outcome: ["restored", "failed"],
        action: ["restore", "remove"],
        target: [`topic:${OBJECT}`, "variety:other"],
      }),
    ).toEqual({
      outcome: "restored",
      action: "restore",
      target: `topic:${OBJECT}`,
    });
  });

  it.each([
    [{}],
    [{ outcome: "removed", action: "remove" }],
    [{ outcome: "deleted", action: "remove", target: `topic:${OBJECT}` }],
    [{ outcome: "removed", action: "toggle", target: `topic:${OBJECT}` }],
    [{ outcome: "removed", action: "remove", target: "" }],
    [
      {
        outcome: "removed",
        action: "remove",
        target: "journal_entry:../../etc",
      },
    ],
    [{ outcome: "removed", action: "remove", target: "variety:a/b" }],
    [{ outcome: "removed", action: "remove", target: "USER:abc" }],
    [
      {
        outcome: "removed",
        action: "remove",
        target: "<script>alert(1)</script>",
      },
    ],
    [{ outcome: "removed", action: "remove", target: "«Томат» прибрано" }],
    [{ outcome: "removed", action: "remove", target: `${"a".repeat(33)}:ref` }],
    [
      {
        outcome: "removed",
        action: "remove",
        target: `variety:${"a".repeat(129)}`,
      },
    ],
    // A bare catalogue id was the retired wishlist's target (ADR-0033).
    [{ outcome: "removed", action: "remove", target: OBJECT }],
    // The addresses the shelves used before OVE-502 say nothing any more.
    [{ undoKind: "variety", undoRef: "pomidor-cheri-0000000101" }],
    [{ undoSlug: "pomidor-cheri-0000000101" }],
  ])("reads nothing from %j", (query) => {
    expect(readShelfOutcome(query)).toBeNull();
  });

  it("accepts a reference up to its bound", () => {
    const target = `variety:${"a".repeat(128)}`;
    expect(
      readShelfOutcome({ outcome: "removed", action: "remove", target }),
    ).toEqual({ outcome: "removed", action: "remove", target });
  });
});
