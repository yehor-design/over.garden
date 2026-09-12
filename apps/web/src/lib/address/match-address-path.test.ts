import { describe, expect, it } from "vitest";

import {
  matchAddressPath,
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
    expect(matchAddressPath("profileHandle", "/@yehor_design")).toBe(
      "yehor_design",
    );
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
    expect(unservableAddressNamespace("/@yehor/anything")).toBe(
      "profileHandle",
    );
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
