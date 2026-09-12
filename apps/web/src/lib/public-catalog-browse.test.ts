import { describe, expect, it } from "vitest";

import {
  CATALOG_BROWSE_INITIALS,
  buildPublicCatalogBrowseHref,
  catalogBrowseInitial,
  catalogKingdomFromSlug,
  initialOfCatalogName,
  isPublicCatalogBrowsePath,
  normalizePublicCatalogBrowseRequest,
} from "@/lib/public-catalog-browse";

describe("the catalog's front door", () => {
  it("knows the eight kingdoms by slug and nothing else", () => {
    expect(catalogKingdomFromSlug("plantae")).toBe("Plantae");
    expect(catalogKingdomFromSlug("PLANTAE")).toBe("Plantae");
    expect(catalogKingdomFromSlug("animalia")).toBe("Animalia");
    // A typo in an import must not mint a crawlable page.
    expect(catalogKingdomFromSlug("plants")).toBeNull();
    expect(catalogKingdomFromSlug("")).toBeNull();
    expect(catalogKingdomFromSlug(null)).toBeNull();
  });

  it("accepts the latin initials and the digit bucket", () => {
    expect(CATALOG_BROWSE_INITIALS).toHaveLength(27);
    expect(catalogBrowseInitial("S")).toBe("s");
    expect(catalogBrowseInitial("#")).toBe("#");
    // A Cyrillic initial cannot occur: a catalog name is a scientific name or
    // a romanized denomination, and both namespaces are latin.
    expect(catalogBrowseInitial("б")).toBeNull();
    expect(catalogBrowseInitial("ss")).toBeNull();
  });

  it("files every name under an initial", () => {
    expect(initialOfCatalogName("Solanum lycopersicum")).toBe("s");
    expect(initialOfCatalogName("apis mellifera")).toBe("a");
    expect(initialOfCatalogName("3 Ages")).toBe("#");
    expect(initialOfCatalogName("")).toBe("#");
  });

  it("folds an initial without a kingdom back to the root", () => {
    expect(normalizePublicCatalogBrowseRequest({ letter: "s" })).toEqual({
      kingdom: null,
      initial: null,
      page: 1,
    });
    expect(
      normalizePublicCatalogBrowseRequest({ kingdom: "plantae", letter: "s" }),
    ).toEqual({ kingdom: "Plantae", initial: "s", page: 1 });
  });

  it("reads a page number and refuses anything that is not one", () => {
    const of = (page: string) =>
      normalizePublicCatalogBrowseRequest({ kingdom: "fungi", page }).page;
    expect(of("3")).toBe(3);
    expect(of("0")).toBe(1);
    expect(of("abc")).toBe(1);
    expect(of("-2")).toBe(1);
  });

  it("builds one href per view, with the locale prefix the address law wants", () => {
    expect(buildPublicCatalogBrowseHref("uk")).toBe("/species");
    expect(buildPublicCatalogBrowseHref("bg")).toBe("/bg/species");
    expect(
      buildPublicCatalogBrowseHref("uk", { kingdom: "Plantae", initial: "s" }),
    ).toBe("/species?kingdom=plantae&letter=s");
    expect(
      buildPublicCatalogBrowseHref("ru", {
        kingdom: "Fungi",
        initial: "a",
        page: 4,
      }),
    ).toBe("/ru/species?kingdom=fungi&letter=a&page=4");
    // Page one is the bare view: two addresses for one page is what the
    // address law exists to prevent.
    expect(
      buildPublicCatalogBrowseHref("uk", { kingdom: "Fungi", page: 1 }),
    ).toBe("/species?kingdom=fungi");
    // An initial without a kingdom is not a view, so it is not an href either.
    expect(buildPublicCatalogBrowseHref("uk", { initial: "s" })).toBe(
      "/species",
    );
  });

  it("recognises the browse root and never an organism page", () => {
    expect(isPublicCatalogBrowsePath("/species")).toBe(true);
    expect(isPublicCatalogBrowsePath("/bg/species")).toBe(true);
    expect(isPublicCatalogBrowsePath("/species/")).toBe(true);
    expect(isPublicCatalogBrowsePath("/species/solanum-lycopersicum")).toBe(
      false,
    );
  });
});
