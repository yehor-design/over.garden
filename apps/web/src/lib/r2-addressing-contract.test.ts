import { describe, expect, it } from "vitest";

import {
  CANONICAL_PRODUCTION_R2_ENDPOINT,
  assertCanonicalProductionR2Addressing,
  resolveR2AddressingReceipt,
  resolveR2ForcePathStyle,
} from "./r2-addressing-contract";

const PRODUCTION_ENV = {
  VERCEL_ENV: "production",
  R2_ENDPOINT: CANONICAL_PRODUCTION_R2_ENDPOINT,
  R2_FORCE_PATH_STYLE: "true",
};

describe("R2 addressing contract", () => {
  it("accepts only the canonical production endpoint with exact path-style enablement", () => {
    expect(resolveR2AddressingReceipt(PRODUCTION_ENV)).toEqual({
      schemaVersion: "overgarden.r2-addressing.v1",
      environmentClass: "production",
      addressingClass: "path_style",
      enforcement: "verified",
    });
    expect(resolveR2ForcePathStyle(PRODUCTION_ENV)).toBe(true);
    expect(() =>
      assertCanonicalProductionR2Addressing(PRODUCTION_ENV),
    ).not.toThrow();
  });

  it.each([
    ["false", "virtual_hosted_style"],
    [undefined, "virtual_hosted_style"],
    ["1", "invalid_configuration"],
    [" true ", "invalid_configuration"],
  ] as const)(
    "refuses production R2_FORCE_PATH_STYLE=%s",
    (value, addressingClass) => {
      const env = { ...PRODUCTION_ENV, R2_FORCE_PATH_STYLE: value };

      expect(resolveR2AddressingReceipt(env)).toEqual({
        schemaVersion: "overgarden.r2-addressing.v1",
        environmentClass: "production",
        addressingClass,
        enforcement: "refused",
      });
      expect(() => resolveR2ForcePathStyle(env)).toThrow(
        "Production R2 addressing contract is not verified.",
      );
    },
  );

  it("refuses endpoint drift without disclosing the configured endpoint", () => {
    const env = {
      ...PRODUCTION_ENV,
      R2_ENDPOINT: "https://example.invalid",
    };
    const receipt = resolveR2AddressingReceipt(env);

    expect(receipt).toMatchObject({
      addressingClass: "invalid_configuration",
      enforcement: "refused",
    });
    expect(JSON.stringify(receipt)).not.toContain("example.invalid");
    expect(Object.keys(receipt).sort()).toEqual(
      [
        "schemaVersion",
        "environmentClass",
        "addressingClass",
        "enforcement",
      ].sort(),
    );
  });

  it("preserves the existing boolean behavior outside production", () => {
    expect(resolveR2ForcePathStyle({ R2_FORCE_PATH_STYLE: "true" })).toBe(true);
    expect(resolveR2ForcePathStyle({ R2_FORCE_PATH_STYLE: "1" })).toBe(true);
    expect(resolveR2ForcePathStyle({ R2_FORCE_PATH_STYLE: "false" })).toBe(
      false,
    );
    expect(resolveR2AddressingReceipt({})).toEqual({
      schemaVersion: "overgarden.r2-addressing.v1",
      environmentClass: "non_production",
      addressingClass: "not_applicable",
      enforcement: "not_applicable",
    });
  });

  it("supports an explicit production classification for provider-env read-back", () => {
    const env = {
      R2_ENDPOINT: CANONICAL_PRODUCTION_R2_ENDPOINT,
      R2_FORCE_PATH_STYLE: "true",
    };

    expect(resolveR2AddressingReceipt(env, "production")).toMatchObject({
      environmentClass: "production",
      enforcement: "verified",
    });
  });
});
