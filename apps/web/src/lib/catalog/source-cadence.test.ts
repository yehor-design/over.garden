import { describe, expect, it } from "vitest";

import {
  CATALOG_SOURCE_REFRESH_CADENCES,
  catalogSourceRefreshCadence,
} from "./source-cadence";
import { getOperatorCatalogCopy } from "@/lib/operator-catalog-copy";

describe("how often a source is worth reading again", () => {
  it("names the cadence of the two releases OVE-396 reads", () => {
    expect(catalogSourceRefreshCadence("world-flora-online")).toBe(
      "twice_a_year",
    );
    expect(catalogSourceRefreshCadence("gbif-backbone")).toBe("as_released");
  });

  it("says nothing about a source whose rhythm nobody recorded", () => {
    // A guessed cadence on a card is worse than a missing one: the owner would
    // act on it.
    expect(catalogSourceRefreshCadence("ua-state-register")).toBeNull();
    expect(catalogSourceRefreshCadence("")).toBeNull();
  });

  it("has a word for every cadence in all three interface languages", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const copy = getOperatorCatalogCopy(locale);
      for (const cadence of CATALOG_SOURCE_REFRESH_CADENCES) {
        expect(copy.sources.cadenceNames[cadence]).toBeTruthy();
      }
    }
  });
});
