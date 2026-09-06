import { describe, expect, it } from "vitest";

import {
  formatOrganismDate,
  formatOrganismFactParagraph,
  organismRoleFor,
} from "./public-organism-copy";

describe("organism fact paragraph (ADR-0026 D9)", () => {
  const species = {
    canonicalName: "Solanum lycopersicum L.",
    catalogKind: "species" as const,
    speciesName: null,
    formCount: 3,
    gardenerCount: 2,
    regionCount: 2,
  };

  it("builds a species paragraph from structured fields only, in three locales", () => {
    expect(formatOrganismFactParagraph("uk", species)).toBe(
      "Solanum lycopersicum L. — вид. У каталозі 3 форми цього виду. Публічні журнали ведуть 2 садівники у 2 областях.",
    );
    expect(formatOrganismFactParagraph("bg", species)).toBe(
      "Solanum lycopersicum L. — вид. В каталога има 3 форми на този вид. Публични дневници водят 2 градинари в 2 области.",
    );
    expect(formatOrganismFactParagraph("ru", species)).toBe(
      "Solanum lycopersicum L. — вид. В каталоге 3 формы этого вида. Публичные дневники ведут 2 садовода в 2 областях.",
    );
  });

  it("names the species of a form and leaves out every sentence whose value is absent", () => {
    const form = {
      canonicalName: "Де Барао",
      catalogKind: "plant_variety" as const,
      speciesName: "Solanum lycopersicum L.",
      formCount: 0,
      gardenerCount: 1,
      regionCount: 0,
    };
    expect(formatOrganismFactParagraph("uk", form)).toBe(
      "Де Барао — сорт виду Solanum lycopersicum L. Публічні журнали ведуть 1 садівник.",
    );
    expect(
      formatOrganismFactParagraph("uk", {
        ...form,
        speciesName: null,
        gardenerCount: 0,
      }),
    ).toBe("Де Барао — сорт. Публічних записів садівників ще немає.");
    expect(
      formatOrganismFactParagraph("bg", {
        canonicalName: "Карпатска",
        catalogKind: "breed",
        speciesName: "Apis mellifera",
        formCount: 5,
        gardenerCount: 0,
        regionCount: 0,
      }),
    ).toBe(
      "Карпатска — порода или линия от вида Apis mellifera. Все още няма публични записи от градинари.",
    );
    expect(
      formatOrganismFactParagraph("ru", {
        ...species,
        formCount: 21,
        gardenerCount: 5,
        regionCount: 1,
      }),
    ).toBe(
      "Solanum lycopersicum L. — вид. В каталоге 21 форма этого вида. Публичные дневники ведут 5 садоводов в 1 области.",
    );
  });

  it("formats dates per locale in UTC and refuses garbage", () => {
    expect(formatOrganismDate("uk", "2026-09-05T20:33:20.511Z")).toBe(
      "5 вересня 2026 р.",
    );
    expect(formatOrganismDate("bg", new Date("2026-09-05T20:33:20.511Z"))).toBe(
      "5 септември 2026 г.",
    );
    expect(formatOrganismDate("ru", null)).toBeNull();
    expect(formatOrganismDate("ru", "not a date")).toBeNull();
  });
});

describe("what a card calls an organism with hosts (OVE-394, ADR-0026 D11)", () => {
  it("calls an animal a pest and a fungus a disease, only when it has hosts", () => {
    expect(organismRoleFor({ kingdom: "Animalia", hostCount: 2 })).toBe("pest");
    expect(organismRoleFor({ kingdom: "Fungi", hostCount: 1 })).toBe("disease");
    expect(organismRoleFor({ kingdom: "Viruses", hostCount: 1 })).toBe(
      "disease",
    );
    expect(organismRoleFor({ kingdom: "Bacteria", hostCount: 1 })).toBe(
      "disease",
    );
    // A parasitic plant attacks a garden the way an insect does.
    expect(organismRoleFor({ kingdom: "Plantae", hostCount: 1 })).toBe("pest");
    // Without a host EPPO never called it a pest, so neither does the card.
    expect(organismRoleFor({ kingdom: "Animalia", hostCount: 0 })).toBeNull();
    expect(organismRoleFor({ kingdom: null, hostCount: 3 })).toBeNull();
  });

  it("puts the word in the first sentence instead of the catalog kind", () => {
    const paragraph = formatOrganismFactParagraph("uk", {
      canonicalName: "Leptinotarsa decemlineata",
      catalogKind: "species",
      speciesName: null,
      formCount: 0,
      gardenerCount: 0,
      regionCount: 0,
      organismRole: "pest",
    });

    expect(paragraph).toContain("Leptinotarsa decemlineata — шкідник.");
    expect(paragraph).not.toContain("вид.");
  });
});
