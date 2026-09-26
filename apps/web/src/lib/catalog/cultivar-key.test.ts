import { describe, expect, it } from "vitest";

import { cultivarMatchRank, cultivarNameKey } from "./cultivar-key";
import { CULTIVAR_KEY_FIXTURE } from "./cultivar-key-fixture";

describe("cultivarNameKey", () => {
  it.each(CULTIVAR_KEY_FIXTURE)("keys %j as %j", (value, key) => {
    expect(cultivarNameKey(value)).toBe(key);
  });

  it("reads Ukrainian and Russian spellings of one sound as one name", () => {
    expect(cultivarNameKey("Черокі")).toBe(cultivarNameKey("Чероки"));
    expect(cultivarNameKey("Де Барао")).toBe(cultivarNameKey("де барао"));
  });

  it("keeps two different words two names", () => {
    expect(cultivarNameKey("Бичаче серце")).not.toBe(
      cultivarNameKey("Бычье сердце"),
    );
  });
});

describe("cultivarMatchRank", () => {
  it("puts the same name first, then a prefix, then a part", () => {
    expect(cultivarMatchRank("бичаче серце", "Бичаче серце")).toBe(0);
    expect(cultivarMatchRank("бича", "Бичаче серце")).toBe(1);
    expect(cultivarMatchRank("серце", "Бичаче серце")).toBe(2);
  });

  it("forgives a typo in a longer query", () => {
    expect(cultivarMatchRank("брма", "Брама")).toBe(4);
    expect(cultivarMatchRank("бичаче серцк", "Бичаче серце")).toBe(4);
    expect(cultivarMatchRank("черрокі", "Черокі")).toBe(4);
  });

  it("is not fuzzy below four letters", () => {
    expect(cultivarMatchRank("брм", "Брама")).toBeNull();
    expect(cultivarMatchRank("кук", "Брама")).toBeNull();
  });

  it("does not match an unrelated name", () => {
    expect(cultivarMatchRank("орпінгтон", "Брама")).toBeNull();
  });

  it("matches everything for an empty query", () => {
    expect(cultivarMatchRank("  ", "Брама")).toBe(3);
  });
});
