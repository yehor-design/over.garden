import { describe, expect, it } from "vitest";

import {
  defaultObjectKindForCatalogSelection,
  objectKindAfterCatalogSelection,
  resolveObjectKindForCatalogSelection,
} from "./catalog-object-kind";

describe("catalog object-kind mapping", () => {
  it("maps bee manual breeds to bee colonies and VBO breeds to animals", () => {
    expect(
      defaultObjectKindForCatalogSelection("breed", "ua_official_bee_breed"),
    ).toBe("bee_colony");
    expect(
      defaultObjectKindForCatalogSelection(
        "breed",
        "vertebrate_breed_ontology",
      ),
    ).toBe("animal");
    expect(
      defaultObjectKindForCatalogSelection(
        "plant_variety",
        "ua_state_register",
      ),
    ).toBe("plant");
  });

  it("requires breed selections to match their animal or bee source", () => {
    expect(() =>
      resolveObjectKindForCatalogSelection(
        "animal",
        "breed",
        "ua_official_bee_breed",
      ),
    ).toThrow("Bee-breed catalog identities require a bee colony object.");
    expect(
      resolveObjectKindForCatalogSelection(
        "",
        "breed",
        "vertebrate_breed_ontology",
      ),
    ).toBe("animal");
    expect(() =>
      resolveObjectKindForCatalogSelection(
        "plant",
        "breed",
        "vertebrate_breed_ontology",
      ),
    ).toThrow("Breed catalog identities require an animal object.");
    expect(
      resolveObjectKindForCatalogSelection("", "species", "species_backbone"),
    ).toBe("plant");
  });

  it("rejects plant varieties on animal and bee-colony objects", () => {
    expect(() =>
      resolveObjectKindForCatalogSelection(
        "animal",
        "plant_variety",
        "ua_state_register",
      ),
    ).toThrow("Plant-variety catalog identities require a plant object.");
    expect(() =>
      resolveObjectKindForCatalogSelection(
        "bee_colony",
        "plant_variety",
        "ua_state_register",
      ),
    ).toThrow("Plant-variety catalog identities require a plant object.");
  });

  it("rejects invalid object-kind values even for breed fallback", () => {
    expect(() =>
      resolveObjectKindForCatalogSelection(
        "unsupported",
        "breed",
        "vertebrate_breed_ontology",
      ),
    ).toThrow("Object kind must be plant, bee colony, or animal.");
  });

  it("preserves the user's explicit kind for species suggestions", () => {
    expect(
      objectKindAfterCatalogSelection("animal", "species", "species_backbone"),
    ).toBe("animal");
    expect(
      objectKindAfterCatalogSelection(
        "bee_colony",
        "species",
        "species_backbone",
      ),
    ).toBe("bee_colony");
    expect(
      objectKindAfterCatalogSelection(
        "animal",
        "plant_variety",
        "ua_state_register",
      ),
    ).toBe("plant");
    expect(
      objectKindAfterCatalogSelection(
        "plant",
        "breed",
        "ua_official_bee_breed",
      ),
    ).toBe("bee_colony");
  });
});
