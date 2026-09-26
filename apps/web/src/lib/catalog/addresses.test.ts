import { describe, expect, it } from "vitest";

import {
  isCatalogAliasScheme,
  legacyCatalogKindForSegment,
  matchCatalogSpeciesHubPath,
  matchPublicCatalogAddressPath,
  publicCatalogRegisterHubPath,
  publicCatalogPermalinkPath,
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

  it("builds the permalink", () => {
    expect(publicCatalogPermalinkPath("11111111-1111-4111-8111-111111111111")).toBe(
      "/id/11111111-1111-4111-8111-111111111111",
    );
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
