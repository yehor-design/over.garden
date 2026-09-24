import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  getCoarseRegionLabel,
  isCoarseRegionCode,
  normalizeCoarseRegionCode,
  publicRegionCode,
  publicRegionLabel,
} from "./regions";

describe("coarse region contract", () => {
  it("normalizes only supported UA/BG subdivision codes", () => {
    expect(normalizeCoarseRegionCode("ua-30")).toBe("UA-30");
    expect(normalizeCoarseRegionCode("BG-22")).toBe("BG-22");
    expect(getCoarseRegionLabel("UA-30")).toBe("Ukraine - Kyiv City");
    expect(isCoarseRegionCode("UA-30")).toBe(true);
  });

  it("hands a public page a code, and words it in the reader's language", () => {
    // The object's own region when it shows one; else its space's.
    expect(
      publicRegionCode({
        objectLocationVisibility: "region",
        objectCoarseRegionCode: "UA-30",
        spaceLocationVisibility: "region",
        spaceCoarseRegionCode: "UA-32",
      }),
    ).toBe("UA-30");
    expect(
      publicRegionCode({
        objectLocationVisibility: "region",
        objectCoarseRegionCode: null,
        spaceLocationVisibility: "region",
        spaceCoarseRegionCode: "ua-32",
      }),
    ).toBe("UA-32");
    // Hidden, or anything that is not a supported code, shows nothing.
    expect(
      publicRegionCode({
        objectLocationVisibility: "hidden",
        objectCoarseRegionCode: "UA-30",
      }),
    ).toBeNull();
    expect(
      publicRegionCode({
        objectLocationVisibility: "region",
        objectCoarseRegionCode: "Kyiv apartment balcony",
        spaceLocationVisibility: "hidden",
        spaceCoarseRegionCode: "UA-32",
      }),
    ).toBeNull();
    // Each interface its own words: the English label was printed under all
    // three (`OVE-478`).
    expect(publicRegionLabel("uk", "UA-30")).toBe(
      "Регіон: Україна — місто Київ",
    );
    expect(publicRegionLabel("bg", "UA-30")).toBe(
      "Регион: Украйна — град Киев",
    );
    expect(publicRegionLabel("ru", "UA-30")).toBe(
      "Регион: Украина — город Киев",
    );
    expect(publicRegionLabel("uk", "Kyiv apartment balcony")).toBeNull();
    expect(publicRegionLabel("uk", null)).toBeNull();
  });

  it("rejects free-form or precise location input", () => {
    expect(normalizeCoarseRegionCode("Kyiv apartment address")).toBeNull();
    expect(normalizeCoarseRegionCode("49.8397,24.0297")).toBeNull();
    expect(normalizeCoarseRegionCode("UA-Kyiv-Shevchenkivskyi")).toBeNull();
    expect(isCoarseRegionCode("gps:49.8397,24.0297")).toBe(false);
  });

  it("keeps the SQL schema free of exact-location columns", () => {
    const schema = readFileSync(
      new URL("../../../sql/0001_walking_skeleton.sql", import.meta.url),
      "utf8",
    );

    expect(schema).toContain("coarse_region_code");
    for (const forbidden of [
      "address",
      "coordinates",
      "latitude",
      "longitude",
      "gps",
      "geohash",
      "plus_code",
    ]) {
      expect(schema.toLowerCase()).not.toMatch(
        new RegExp(`\\b${forbidden}\\b`),
      );
    }
  });
});
