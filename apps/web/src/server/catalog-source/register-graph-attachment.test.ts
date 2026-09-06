import { describe, expect, it } from "vitest";

import {
  readRegisterClaim,
  speciesOfBreedGroup,
  registrationYear,
  scientificHalfOfCropLine,
} from "./register-graph-attachment";

describe("reading a register row as a claim (OVE-395, ADR-0026 D1, D8, D13)", () => {
  it("takes the Latin half of a crop line and leaves the common name behind", () => {
    // The Official Journal writes both halves in one cell.
    expect(scientificHalfOfCropLine("Beta vulgaris L. - Sugar beet")).toBe(
      "Beta vulgaris L.",
    );
    expect(scientificHalfOfCropLine("Solanum lycopersicum L. – Tomato")).toBe(
      "Solanum lycopersicum L.",
    );
    expect(scientificHalfOfCropLine("Zea mays L.")).toBe("Zea mays L.");
  });

  it("finds a year in a date, a bare year, or nothing at all", () => {
    expect(registrationYear("2026-02-12")).toBe("2026");
    expect(registrationYear("2001")).toBe("2001");
    expect(registrationYear("NULL")).toBeNull();
    expect(registrationYear(null)).toBeNull();
  });

  it("reads a Ukrainian State Register row", () => {
    const claim = readRegisterClaim(
      "ua-state-register",
      {
        row: {
          taxonNameLat: "Prunus armeniaca L.",
          varietyName: "Ботсадівський",
        },
        normalizedRow: {
          taxonNameLat: "Prunus armeniaca L.",
          varietyName: "Ботсадівський",
          startDateRegistration: "2001",
          proposedZone: "СЛ",
          countryCodeApplicant: "UA",
        },
      },
      {},
    );

    expect(claim).toEqual({
      speciesText: "Prunus armeniaca L.",
      denomination: "Ботсадівський",
      regionCode: "UA",
      year: "2001",
      status: "registered",
      qualifiers: {
        register: "ua_state_register",
        zone: "СЛ",
        applicant_country: "UA",
      },
    });
  });

  it("reads an EU Common Catalogue row, with the notifying state as its market", () => {
    const claim = readRegisterClaim(
      "eu-oj-eur-lex-common-catalogue",
      {
        row: {
          speciesOrCrop: "Beta vulgaris L. - Sugar beet",
          varietyDenomination: "Coyote",
          countryCode: "ES",
          notifierCode: "ES 1502",
          supplementLabel: "Supplement A 2026/1",
          admissionAction: "modify",
          publicationDate: "2026-02-12",
        },
      },
      {},
    );

    expect(claim.speciesText).toBe("Beta vulgaris L.");
    expect(claim.denomination).toBe("Coyote");
    expect(claim.regionCode).toBe("ES");
    expect(claim.year).toBe("2026");
    expect(claim.status).toBe("registered");
    expect(claim.qualifiers).toMatchObject({
      register: "eu_common_catalogue",
      notifier: "ES 1502",
      admission_action: "modify",
    });
  });

  it("records a withdrawal as a fact rather than deleting anything", () => {
    const claim = readRegisterClaim(
      "eu-oj-eur-lex-common-catalogue",
      {
        row: {
          speciesOrCrop: "Zea mays L. - Maize",
          varietyDenomination: "Retired",
          admissionAction: "delete",
          publicationDate: "2026-02-12",
        },
      },
      {},
    );

    expect(claim.status).toBe("withdrawn");
    // No member state on the row: the catalogue itself is the market.
    expect(claim.regionCode).toBe("EU");
  });

  it("reads a breed row from its projection's species group", () => {
    const claim = readRegisterClaim(
      "ua-bee-breeds",
      { row: {} },
      { speciesGroup: "Apis mellifera", canonicalName: "Українська степова" },
    );

    expect(claim.speciesText).toBe("Apis mellifera");
    expect(claim.denomination).toBe("Українська степова");
    expect(claim.regionCode).toBe("UA");
  });

  it("turns a husbandry word into the species behind it", () => {
    const claim = readRegisterClaim(
      "vertebrate-breed-ontology",
      { row: {} },
      { speciesGroup: "Cattle", canonicalName: "Українська червона" },
    );

    // A checklist has never heard of "Cattle"; leaving it unmapped would send
    // every cattle breed to a curator for a name nobody disputes.
    expect(claim.speciesText).toBe("Bos taurus");
    expect(speciesOfBreedGroup("Honey bee")).toBe("Apis mellifera");
    // A group nobody mapped is passed through rather than guessed at.
    expect(speciesOfBreedGroup("Alpaca")).toBe("Alpaca");
  });

  it("returns nothing to match on when the register named no species", () => {
    const claim = readRegisterClaim(
      "ua-state-register",
      { row: { taxonNameLat: "NULL", varietyName: "Безрідний" } },
      {},
    );

    expect(claim.speciesText).toBeNull();
    expect(claim.denomination).toBe("Безрідний");
  });
});
