import { describe, expect, it } from "vitest";

import { getSpeciesPageCopy, speciesPageSubject } from "./species-page-copy";

describe("a species page's words (OVE-519)", () => {
  it("keeps the placeholders the owner approved, word for word", () => {
    expect(getSpeciesPageCopy("uk").placeholder.plant).toBe(
      "Записи про цю рослину від людей, які ведуть її журнал на Overgarden.",
    );
    expect(getSpeciesPageCopy("uk").placeholder.animal).toBe(
      "Записи про цю тварину від людей, які ведуть її журнал на Overgarden.",
    );
  });

  it("says every line in every language, with the brand spelt «Overgarden» and no count", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const copy = getSpeciesPageCopy(locale);
      const lines = [
        copy.entriesHeading,
        copy.empty,
        ...Object.values(copy.placeholder),
      ];
      for (const line of lines) {
        expect(line.trim().length, `${locale}: ${line}`).toBeGreaterThan(0);
        expect(line, `${locale}: ${line}`).not.toMatch(/OverGarden|\d/u);
      }
      for (const placeholder of Object.values(copy.placeholder)) {
        expect(placeholder).toContain("Overgarden");
      }
    }
    // Bulgarian and Russian are their own, not Ukrainian left behind.
    for (const locale of ["bg", "ru"] as const) {
      const copy = getSpeciesPageCopy(locale);
      expect(
        [copy.empty, ...Object.values(copy.placeholder)].join(" "),
      ).not.toMatch(/[іїєґ]/u);
    }
  });

  it("chooses the placeholder by what the page is, then by its kingdom", () => {
    expect(
      speciesPageSubject({ catalogKind: "species", kingdom: "Plantae" }),
    ).toBe("plant");
    expect(
      speciesPageSubject({ catalogKind: "species", kingdom: "Animalia" }),
    ).toBe("animal");
    expect(
      speciesPageSubject({ catalogKind: "plant_variety", kingdom: "Plantae" }),
    ).toBe("cultivar");
    expect(
      speciesPageSubject({ catalogKind: "breed", kingdom: "Animalia" }),
    ).toBe("breed");
    expect(
      speciesPageSubject({ catalogKind: "species", kingdom: "Fungi" }),
    ).toBe("species");
    expect(speciesPageSubject({ catalogKind: "species", kingdom: null })).toBe(
      "species",
    );
  });
});
