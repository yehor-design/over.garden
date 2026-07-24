import { describe, expect, it } from "vitest";

import {
  defaultObjectKindForCatalogSelection,
  normalizePublicObjectKindFilter,
  objectKindAfterCatalogSelection,
  resolveObjectKindForCatalogSelection,
} from "./catalog-object-kind";

describe("catalog object-kind mapping", () => {
  it("maps every breed (including bee breeds) to animal", () => {
    expect(
      defaultObjectKindForCatalogSelection("breed", "ua_official_bee_breed"),
    ).toBe("animal");
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

  it("requires breed selections to be animal objects", () => {
    expect(
      resolveObjectKindForCatalogSelection(
        "animal",
        "breed",
        "ua_official_bee_breed",
      ),
    ).toBe("animal");
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

  it("rejects plant varieties on animal objects", () => {
    expect(() =>
      resolveObjectKindForCatalogSelection(
        "animal",
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
    ).toThrow("Object kind must be plant or animal.");
  });

  it("maps legacy public kind filters to animal", () => {
    expect(normalizePublicObjectKindFilter(" BEE_COLONY ")).toBe("animal");
    expect(normalizePublicObjectKindFilter("animal")).toBe("animal");
    expect(normalizePublicObjectKindFilter("plant")).toBe("plant");
    expect(normalizePublicObjectKindFilter("person")).toBeNull();
  });

  it("preserves the user's explicit kind for species suggestions", () => {
    expect(
      objectKindAfterCatalogSelection("animal", "species", "species_backbone"),
    ).toBe("animal");
    expect(
      objectKindAfterCatalogSelection(
        "plant",
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
    ).toBe("animal");
  });
});
