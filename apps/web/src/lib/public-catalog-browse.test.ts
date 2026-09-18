import { describe, expect, it } from "vitest";

import {
  buildCatalogBrowseRemovalHref,
  buildPublicCatalogBrowseHref,
  catalogBrowseInitial,
  catalogKingdomFromSlug,
  initialOfCatalogName,
  isPublicCatalogBrowsePath,
  isUnfilteredCatalogBrowseRequest,
  matchLegacyCatalogBrowsePath,
  normalizePublicCatalogBrowseRequest,
} from "./public-catalog-browse";

describe("the catalogue's one address", () => {
  it("is /catalog, and the two doors it replaced are recognised", () => {
    expect(isPublicCatalogBrowsePath("/catalog")).toBe(true);
    expect(isPublicCatalogBrowsePath("/bg/catalog")).toBe(true);
    expect(isPublicCatalogBrowsePath("/catalog/")).toBe(true);
    // An organism's own page is not the listing.
    expect(isPublicCatalogBrowsePath("/species/solanum-lycopersicum")).toBe(
      false,
    );

    expect(matchLegacyCatalogBrowsePath("/objects")).toBe("/objects");
    expect(matchLegacyCatalogBrowsePath("/ru/species")).toBe("/species");
    // Only the index moved. Every organism keeps its own address.
    expect(matchLegacyCatalogBrowsePath("/species/apis-mellifera")).toBeNull();
    expect(matchLegacyCatalogBrowsePath("/variety/red-cherry")).toBeNull();
  });

  it("writes only what is set, so one view has one address", () => {
    expect(buildPublicCatalogBrowseHref("uk")).toBe("/catalog");
    expect(buildPublicCatalogBrowseHref("bg")).toBe("/bg/catalog");
    // Absent means unset: no `kingdom=all`, no `page=1`, no default sort.
    expect(
      buildPublicCatalogBrowseHref("uk", {
        kingdoms: [],
        page: 1,
        sort: "name",
      }),
    ).toBe("/catalog");
    expect(
      buildPublicCatalogBrowseHref("uk", {
        kingdoms: ["Plantae", "Fungi"],
        ranks: ["species"],
        registers: ["ua"],
        grown: true,
        initial: "s",
        query: "solanum",
        sort: "written",
        page: 3,
      }),
    ).toBe(
      "/catalog?q=solanum&kingdom=plantae&kingdom=fungi&rank=species&register=ua&grown=1&letter=s&sort=written&page=3",
    );
  });

  it("reads a request the way the URL carried it, and refuses the rest", () => {
    const request = normalizePublicCatalogBrowseRequest({
      kingdom: ["plantae", "fungi", "narnia"],
      rank: ["species", "phylum"],
      register: ["ua", "xx"],
      grown: "1",
      letter: "S",
      q: "  Solanum  ",
      sort: "written",
      page: "4",
    });

    expect(request.kingdoms).toEqual(["Plantae", "Fungi"]);
    expect(request.ranks).toEqual(["species"]);
    expect(request.registers).toEqual(["ua"]);
    expect(request.grown).toBe(true);
    expect(request.initial).toBe("s");
    expect(request.query).toBe("Solanum");
    expect(request.sort).toBe("written");
    expect(request.page).toBe(4);

    // A kingdom nobody defined would otherwise mint a crawlable page out of a
    // typo in an import.
    expect(catalogKingdomFromSlug("narnia")).toBeNull();
    expect(catalogBrowseInitial("ї")).toBeNull();
    expect(initialOfCatalogName("4-o'clock flower")).toBe("#");
  });

  it("falls back rather than failing on a request nobody built", () => {
    const request = normalizePublicCatalogBrowseRequest({
      sort: "whatever",
      page: "0",
      grown: "yes",
    });
    expect(request.sort).toBe("name");
    expect(request.page).toBe(1);
    expect(request.grown).toBe(false);
    expect(isUnfilteredCatalogBrowseRequest(request)).toBe(true);
  });

  it("knows the unfiltered catalogue, which is the only canonical", () => {
    expect(
      isUnfilteredCatalogBrowseRequest(normalizePublicCatalogBrowseRequest()),
    ).toBe(true);
    expect(
      isUnfilteredCatalogBrowseRequest(
        normalizePublicCatalogBrowseRequest({ letter: "a" }),
      ),
    ).toBe(false);
  });

  it("removes one filter and returns to the first page of what is left", () => {
    const request = normalizePublicCatalogBrowseRequest({
      kingdom: ["plantae", "fungi"],
      grown: "1",
      page: "5",
    });

    // Page 5 of a narrower listing is a different set of results, and often
    // an empty one — so a chip's href is page 1.
    expect(
      buildCatalogBrowseRemovalHref("uk", request, "kingdom", "Fungi"),
    ).toBe("/catalog?kingdom=plantae&grown=1");
    expect(buildCatalogBrowseRemovalHref("uk", request, "grown")).toBe(
      "/catalog?kingdom=plantae&kingdom=fungi",
    );
  });
});
