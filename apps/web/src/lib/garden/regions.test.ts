import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  getCoarseRegionLabel,
  isCoarseRegionCode,
  normalizeCoarseRegionCode,
} from "./regions";

describe("coarse region contract", () => {
  it("normalizes only supported UA/BG subdivision codes", () => {
    expect(normalizeCoarseRegionCode("ua-30")).toBe("UA-30");
    expect(normalizeCoarseRegionCode("BG-22")).toBe("BG-22");
    expect(getCoarseRegionLabel("UA-30")).toBe("Ukraine - Kyiv City");
    expect(isCoarseRegionCode("UA-30")).toBe(true);
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
