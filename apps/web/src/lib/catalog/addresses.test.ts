import { describe, expect, it } from "vitest";

import {
  catalogIdentifierUrl,
  isCatalogAliasScheme,
  legacyCatalogKindForSegment,
  matchCatalogSpeciesHubPath,
  matchPublicCatalogAddressPath,
  publicCatalogRegisterHubPath,
  publicCatalogPermalinkPath,
  schemaTaxonRank,
} from "./addresses";

describe("catalog addresses (ADR-0026 D8)", () => {
  it("recognises the hierarchical and legacy organism pages, with or without a locale prefix", () => {
    expect(matchPublicCatalogAddressPath("/species/solanum-lycopersicum")).toEqual({
      kind: "species",
      speciesSlug: "solanum-lycopersicum",
      formSlug: null,
    });
    expect(
      matchPublicCatalogAddressPath("/bg/species/solanum-lycopersicum/de-barao/"),
    ).toEqual({
      kind: "species",
      speciesSlug: "solanum-lycopersicum",
      formSlug: "de-barao",
    });
    expect(matchPublicCatalogAddressPath("/variety/pomidor-cheri-0000000101")).toEqual({
      kind: "legacy",
      catalogKind: "plant_variety",
      slug: "pomidor-cheri-0000000101",
    });
    expect(matchPublicCatalogAddressPath("/ru/breed/carpathian-bee")).toEqual({
      kind: "legacy",
      catalogKind: "breed",
      slug: "carpathian-bee",
    });
  });

  it("leaves everything that is not an organism page to the route families", () => {
    for (const pathname of [
      "/",
      "/species",
      "/species/",
      "/species/Solanum-Lycopersicum",
      "/species/solanum-lycopersicum/de-barao/extra",
      "/species/solanum--lycopersicum",
      "/variety",
      "/objects?identity=species",
      "/journal/species",
      "/id/11111111-1111-4111-8111-111111111111",
      "/eppo/LYPES",
    ]) {
      expect(matchPublicCatalogAddressPath(pathname), pathname).toBeNull();
    }
  });

  it("builds the permalink and the outbound identity URLs", () => {
    expect(publicCatalogPermalinkPath("11111111-1111-4111-8111-111111111111")).toBe(
      "/id/11111111-1111-4111-8111-111111111111",
    );
    expect(catalogIdentifierUrl("col", "3W4WV")).toBe(
      "https://www.catalogueoflife.org/data/taxon/3W4WV",
    );
    expect(catalogIdentifierUrl("gbif", "2930137")).toBe(
      "https://www.gbif.org/species/2930137",
    );
    expect(catalogIdentifierUrl("eppo", "LYPES")).toBe("https://gd.eppo.int/taxon/LYPES");
    expect(catalogIdentifierUrl("wikidata", "Q23501")).toBe(
      "https://www.wikidata.org/wiki/Q23501",
    );
    expect(catalogIdentifierUrl("wfo", "wfo-0001019184")).toBe(
      "https://www.worldfloraonline.org/taxon/wfo-0001019184",
    );
    expect(catalogIdentifierUrl("ua_register", "12345")).toBeNull();
    expect(catalogIdentifierUrl("eppo", "a b/c")).toBe(
      "https://gd.eppo.int/taxon/a%20b%2Fc",
    );
  });

  it("maps node kinds and ranks to schema.org taxonRank values", () => {
    expect(schemaTaxonRank({ nodeKind: "taxon", rank: "species" })).toBe("species");
    expect(schemaTaxonRank({ nodeKind: "taxon", rank: "genus" })).toBe("genus");
    expect(schemaTaxonRank({ nodeKind: "taxon", rank: null })).toBe("species");
    expect(schemaTaxonRank({ nodeKind: "cultivar", rank: null })).toBe("cultivar");
    expect(schemaTaxonRank({ nodeKind: "breed", rank: "species" })).toBe("breed");
  });

  it("names the alias schemes and the legacy segments", () => {
    expect(isCatalogAliasScheme("eppo")).toBe(true);
    expect(isCatalogAliasScheme("id")).toBe(false);
    expect(isCatalogAliasScheme("wfo")).toBe(false);
    expect(legacyCatalogKindForSegment("variety")).toBe("plant_variety");
    expect(legacyCatalogKindForSegment("breed")).toBe("breed");
  });
});

describe("the register hub under a species (OVE-433)", () => {
  it("is a page under the species, not a form of it", () => {
    expect(matchCatalogSpeciesHubPath("/species/solanum-lycopersicum/register"))
      .toEqual({ speciesSlug: "solanum-lycopersicum", hub: "register" });
    expect(
      matchCatalogSpeciesHubPath("/bg/species/solanum-lycopersicum/register"),
    ).toEqual({ speciesSlug: "solanum-lycopersicum", hub: "register" });
    // Without this the hub's address would be read as a cultivar named
    // *register* and answered with a 404 it does not deserve.
    expect(
      matchPublicCatalogAddressPath("/species/solanum-lycopersicum/register"),
    ).toBeNull();
  });

  it("leaves every other form address alone", () => {
    expect(matchCatalogSpeciesHubPath("/species/solanum-lycopersicum")).toBeNull();
    expect(
      matchCatalogSpeciesHubPath("/species/solanum-lycopersicum/advance"),
    ).toBeNull();
    expect(
      matchPublicCatalogAddressPath("/species/solanum-lycopersicum/advance"),
    ).toEqual({
      kind: "species",
      speciesSlug: "solanum-lycopersicum",
      formSlug: "advance",
    });
  });

  it("builds the hub address from the species slug", () => {
    expect(publicCatalogRegisterHubPath("solanum-lycopersicum")).toBe(
      "/species/solanum-lycopersicum/register",
    );
  });
});
