import { describe, expect, it } from "vitest";

import {
  assertStandardSpeciesEnvironment,
  parseLoadStandardSpeciesArgs,
} from "../../../scripts/load-standard-species";
import {
  catalogRankOf,
  latinSpellings,
  nameScript,
  sameGenusAndEpithet,
  standardIdentifierPairs,
  standardPopularity,
  type StandardSpeciesFileRow,
} from "./standard-species-load";

const ROW: StandardSpeciesFileRow = {
  key: "plant:fragaria-x-ananassa",
  kind: "plant",
  group: "berries",
  latin: "Fragaria × ananassa",
  rank: "nothospecies",
  wikidata: "Q13158",
  identifiers: { gbif: "3029912", col: "4J9TW", wfo: null, eppo: ["FRAAN"] },
  parentLatin: "Fragaria",
  names: {
    uk: {
      display: "Полуниця",
      search: ["полуниці садові"],
      status: "confirmed",
    },
    bg: { display: "Ягода", search: [], status: "confirmed" },
    ru: { display: "Клубника", search: [], status: "confirmed" },
  },
  popularity: {
    registerCultivars: 40,
    pageviews: { uk: 3069, bg: 172, ru: 9406 },
  },
};

describe("the standard species loader's reading of a row (OVE-530)", () => {
  it("spells a hybrid every way a catalogue writes it", () => {
    expect(latinSpellings("Fragaria × ananassa")).toEqual(
      expect.arrayContaining([
        "Fragaria × ananassa",
        "Fragaria x ananassa",
        "Fragaria ×ananassa",
        "Fragaria ananassa",
      ]),
    );
    expect(latinSpellings("Solanum lycopersicum")).toEqual(
      expect.arrayContaining([
        "Solanum lycopersicum",
        "Solanum x lycopersicum",
      ]),
    );
    expect(latinSpellings("Rosa")).toEqual(["Rosa"]);
  });

  it("keeps the ranks the catalogue holds and reads a nothospecies as a species", () => {
    expect(catalogRankOf("genus")).toBe("genus");
    expect(catalogRankOf("variety")).toBe("variety");
    expect(catalogRankOf("nothospecies")).toBe("species");
    expect(catalogRankOf("species")).toBe("species");
  });

  it("lets a folded EPPO code count only for the row's own genus and epithet", () => {
    expect(
      sameGenusAndEpithet(
        "Citrus ×sinensis",
        "citrus x aurantium var. sinensis",
      ),
    ).toBe(true);
    expect(
      sameGenusAndEpithet(
        "Chrysanthemum morifolium",
        "chrysanthemum x morifolium",
      ),
    ).toBe(true);
    expect(sameGenusAndEpithet("Triticum spelta", "triticum aestivum")).toBe(
      false,
    );
    expect(sameGenusAndEpithet("Rosa", "rosa")).toBe(false);
  });

  it("names the script as the species backbone does", () => {
    expect(nameScript("Полуниця")).toBe("cyrillic");
    expect(nameScript("Fragaria")).toBe("latin");
  });

  it("weighs register cultivars above pageviews", () => {
    expect(standardPopularity(ROW)).toBe(40 * 100 + 3069 + 172 + 9406);
  });

  it("finds by EPPO for a species but never writes an EPPO code", () => {
    expect(standardIdentifierPairs(ROW, { includeEppo: true })).toEqual([
      ["wikidata", "Q13158"],
      ["gbif", "3029912"],
      ["col", "4J9TW"],
      ["eppo", "FRAAN"],
    ]);
    expect(
      standardIdentifierPairs(ROW, { includeEppo: false }),
    ).not.toContainEqual(["eppo", "FRAAN"]);
    // Below species the catalogue folded the varieties' codes into the species.
    expect(
      standardIdentifierPairs(
        { ...ROW, rank: "variety" },
        { includeEppo: true },
      ).map(([scheme]) => scheme),
    ).not.toContain("eppo");
  });
});

describe("load-standard-species.ts", () => {
  it("is a dry run on the loopback database unless told otherwise", () => {
    const args = parseLoadStandardSpeciesArgs([]);
    expect(args).toMatchObject({
      apply: false,
      environment: "local",
      allowNonLocalMutation: false,
    });
    expect(
      assertStandardSpeciesEnvironment(
        args,
        "postgresql://u:p@127.0.0.1:5432/db",
      ),
    ).toEqual({
      databaseHost: "loopback",
    });
  });

  it("refuses a remote database without production said twice and the mutation flag", () => {
    const remote = "postgresql://u:p@db.example.test:25060/defaultdb";
    expect(() =>
      assertStandardSpeciesEnvironment(
        parseLoadStandardSpeciesArgs([]),
        remote,
      ),
    ).toThrow("standard_species_non_local_mutation_refused");
    expect(() =>
      parseLoadStandardSpeciesArgs([
        "--environment",
        "production",
        "--confirm-environment",
        "local",
      ]),
    ).toThrow("standard_species_environment_not_confirmed");
    const production = parseLoadStandardSpeciesArgs([
      "--apply",
      "--environment",
      "production",
      "--confirm-environment",
      "production",
      "--allow-non-local-mutation",
    ]);
    expect(assertStandardSpeciesEnvironment(production, remote)).toEqual({
      databaseHost: "remote",
    });
    expect(() =>
      assertStandardSpeciesEnvironment(
        production,
        "postgresql://u:p@localhost:5432/db",
      ),
    ).toThrow("standard_species_local_database_refused");
  });
});
