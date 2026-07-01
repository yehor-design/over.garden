import { describe, expect, it } from "vitest";

import {
  defaultObjectKindForCatalogSelection,
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

  it("preserves explicit animal breed requests while falling back by source", () => {
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
    expect(
      resolveObjectKindForCatalogSelection(
        "plant",
        "breed",
        "vertebrate_breed_ontology",
      ),
    ).toBe("animal");
    expect(
      resolveObjectKindForCatalogSelection("", "species", "species_backbone"),
    ).toBe("plant");
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
});
