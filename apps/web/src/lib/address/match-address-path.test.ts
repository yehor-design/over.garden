import { describe, expect, it } from "vitest";

import {
  matchAddressPath,
  matchAuthorScopedEntryPath,
  matchAuthorScopedObjectPath,
  matchAuthorScopedPath,
  matchLegacyAuthorScopedEntryPath,
  unservableAddressNamespace,
} from "./match-address-path";

describe("one matcher for every public address (ADR-0029 D3)", () => {
  it("reads the slug out of each family, prefixed or not", () => {
    expect(matchAddressPath("topic", "/topics/plants")).toBe("plants");
    expect(matchAddressPath("topic", "/bg/topics/plants/")).toBe("plants");
    expect(matchAddressPath("journalEntry", "/journal/polyv-bez-pastky")).toBe(
      "polyv-bez-pastky",
    );
    expect(
      matchAddressPath("community", "/ru/communities/observation-and-care"),
    ).toBe("observation-and-care");
    expect(
      matchAddressPath(
        "object",
        "/lineage/objects/11111111-1111-4111-8111-111111111111",
      ),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  /**
   * The community matcher used to spell `[a-z0-9][a-z0-9-]{1,63}` — the pattern
   * the column carried before `OVE-426` widened it — so a Cyrillic community
   * would have stopped matching its own route the day one existed.
   */
  it("reads a Cyrillic slug, decoded", () => {
    expect(
      matchAddressPath("topic", `/topics/${encodeURIComponent("помідори")}`),
    ).toBe("помідори");
    expect(
      matchAddressPath(
        "community",
        `/bg/communities/${encodeURIComponent("домати")}`,
      ),
    ).toBe("домати");
  });

  it("refuses what a lookup could only answer 'not found' about", () => {
    for (const path of [
      "/topics/PLANTS",
      "/topics/not a slug",
      "/topics/-plants",
      "/topics/plants-",
      "/topics/a/b",
      "/topics",
      "/journal/%E0%A4%A",
      "/communities/x.json",
    ]) {
      expect(matchAddressPath("topic", path) ?? matchAddressPath("journalEntry", path) ?? matchAddressPath("community", path), path).toBeNull();
    }
  });

  it("says nothing about a path in another family", () => {
    expect(matchAddressPath("topic", "/communities/plants")).toBeNull();
    expect(matchAddressPath("community", "/topics/plants")).toBeNull();
    expect(matchAddressPath("journalEntry", "/")).toBeNull();
  });
});

describe("addresses no page can serve", () => {
  it("names the namespace of a malformed address", () => {
    expect(unservableAddressNamespace("/topics/Не слаг")).toBe("topic");
    expect(unservableAddressNamespace("/journal/a/b")).toBe("journalEntry");
    expect(unservableAddressNamespace("/bg/communities/a/b")).toBe("community");
    expect(unservableAddressNamespace("/lineage/objects/a/b")).toBe("object");
    // Three namespaces live under `/@`, and a shape that is none of them is
    // reported against the prefix's own namespace.
    expect(unservableAddressNamespace("/@yehor/a/b")).toBe("profileHandle");
    expect(unservableAddressNamespace("/@yehor/objects/a/b")).toBe(
      "profileHandle",
    );
    expect(unservableAddressNamespace("/@yehor/objects")).toBe("profileHandle");
    expect(unservableAddressNamespace("/species/a/b/c")).toBe("species");
  });

  it("leaves a servable address alone", () => {
    for (const path of [
      "/topics/plants",
      "/bg/topics/plants",
      "/journal/polyv",
      "/communities/observation-and-care",
      "/species/solanum-lycopersicum",
      "/species/solanum-lycopersicum/de-barao",
      "/variety/de-barao",
      "/breed/apis-mellifera",
      "/@yehor",
      // An entry and a passport under their author (ADR-0029 D9).
      "/@yehor/полив-без-календарної-пастки",
      "/@yehor/objects/томат",
      "/bg/@yehor/полив",
      "/lineage/objects/11111111-1111-4111-8111-111111111111",
    ]) {
      expect(unservableAddressNamespace(path), path).toBeNull();
    }
  });

  /**
   * A community hosts a discussion under its own address. Treating every
   * deeper path as malformed would have 404'd a page that works.
   */
  it("keeps the routes that live under an address", () => {
    expect(
      unservableAddressNamespace(
        "/communities/observation-and-care/discussions/11111111-1111-4111-8111-111111111111",
      ),
    ).toBeNull();
    expect(
      unservableAddressNamespace(
        "/bg/communities/observation-and-care/discussions/abc",
      ),
    ).toBeNull();
    expect(
      unservableAddressNamespace("/communities/observation-and-care/members"),
    ).toBe("community");
  });

  it("says nothing about a section root or a path outside the manifest", () => {
    for (const path of [
      "/topics",
      "/species",
      "/bg/species",
      "/",
      "/bg",
      "/journals",
      "/garden/objects/abc",
      "/api/public/catalog",
      "/sources/eppo/SOLLC",
    ]) {
      expect(unservableAddressNamespace(path), path).toBeNull();
    }
  });
});

/**
 * Four shapes share `/@{handle}` because they share an owner (ADR-0029 D9).
 * Since 2026-09-18 an entry is addressed by its number, and the name it had
 * under its author is a fourth shape that answers 308 — so the matcher has to
 * tell a number from a name, and must never mistake one for the other.
 */
describe("the four addresses under one author", () => {
  it("tells a profile, an entry, an older name and a passport apart", () => {
    expect(matchAuthorScopedPath("/@yehor")).toEqual({
      kind: "profile",
      handle: "yehor",
    });
    expect(matchAuthorScopedPath("/@yehor/post/12")).toEqual({
      kind: "journalEntry",
      handle: "yehor",
      entryNumber: 12,
    });
    expect(
      matchAuthorScopedPath(`/@yehor/${encodeURIComponent("полив")}`),
    ).toEqual({ kind: "legacyJournalEntry", handle: "yehor", slug: "полив" });
    expect(
      matchAuthorScopedPath(`/@yehor/objects/${encodeURIComponent("томат")}`),
    ).toEqual({ kind: "object", handle: "yehor", slug: "томат" });
  });

  it("hands the number on as a number", () => {
    const matched = matchAuthorScopedEntryPath("/@yehor/post/12");
    expect(matched).toEqual({ handle: "yehor", entryNumber: 12 });
    expect(typeof matched?.entryNumber).toBe("number");
    expect(matchAuthorScopedEntryPath("/@yehor/post/999999999")).toEqual({
      handle: "yehor",
      entryNumber: 999_999_999,
    });
  });

  it("reads the same address through a locale prefix, %40 and a trailing slash", () => {
    for (const path of [
      "/bg/@yehor/post/12",
      "/ru/@yehor/post/12/",
      "/%40yehor/post/12",
      "/@YEHOR/post/12",
    ]) {
      expect(matchAuthorScopedEntryPath(path), path).toEqual({
        handle: "yehor",
        entryNumber: 12,
      });
    }
  });

  /**
   * Nothing ever issued these, so they are not second spellings of `/post/12`
   * — they are nothing. `012` folded into `12` would give one entry two
   * addresses; `%31` is not how anything spells `1`; ten digits is past what
   * the column holds.
   */
  it("refuses every number that is not the one spelling", () => {
    for (const segment of [
      "0",
      "012",
      "-1",
      "+1",
      "1a",
      "1.0",
      "1e3",
      " 1",
      "9999999999",
      "%31",
      "１２",
      "",
    ]) {
      const path = `/@yehor/post/${segment}`;
      expect(matchAuthorScopedPath(path), path).toBeNull();
      expect(unservableAddressNamespace(path), path).toBe("profileHandle");
    }
  });

  it("keeps the two reserved segments out of the names", () => {
    // `/@yehor/post` and `/@yehor/objects` are routes' own words, not entries
    // called *post* and *objects*.
    expect(matchAuthorScopedPath("/@yehor/post")).toBeNull();
    expect(matchAuthorScopedPath("/@yehor/objects")).toBeNull();
    expect(matchLegacyAuthorScopedEntryPath("/@yehor/post")).toBeNull();
    // And a number is never read as a passport or the reverse.
    expect(matchAuthorScopedObjectPath("/@yehor/post/12")).toBeNull();
    expect(matchAuthorScopedEntryPath("/@yehor/objects/12")).toBeNull();
    expect(matchAuthorScopedObjectPath("/@yehor/objects/12")).toEqual({
      handle: "yehor",
      slug: "12",
    });
  });

  it("reads an all-digit name as a name, because that is what it was", () => {
    // A gardener could title an entry "2024". Its name sat at `/@yehor/2024`,
    // two segments; its number sits at `/@yehor/post/{n}`, three. The `post`
    // segment is what keeps the two namespaces from ever meeting.
    expect(matchAuthorScopedPath("/@yehor/2024")).toEqual({
      kind: "legacyJournalEntry",
      handle: "yehor",
      slug: "2024",
    });
    expect(matchAuthorScopedEntryPath("/@yehor/2024")).toBeNull();
  });

  it("answers nothing deeper than three segments, and nothing under a bad handle", () => {
    for (const path of [
      "/@yehor/post/12/x",
      "/@yehor/objects/a/b",
      "/@yehor/a/b",
      "/@ab/post/1",
      "/@_yehor/post/1",
      "/yehor/post/1",
    ]) {
      expect(matchAuthorScopedPath(path), path).toBeNull();
    }
  });
});
