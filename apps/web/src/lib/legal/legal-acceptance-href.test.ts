import { describe, expect, it } from "vitest";

import { legalAcceptanceHref } from "./legal-acceptance-href";

describe("legalAcceptanceHref", () => {
  it("carries where the person was going", () => {
    expect(legalAcceptanceHref("/garden/spaces/new?step=photo")).toBe(
      "/auth/terms?next=%2Fgarden%2Fspaces%2Fnew%3Fstep%3Dphoto",
    );
  });

  it("falls back to the garden for nothing, or for an address off this site", () => {
    expect(legalAcceptanceHref(null)).toBe("/auth/terms?next=%2Fgarden");
    expect(legalAcceptanceHref("https://evil.example/")).toBe(
      "/auth/terms?next=%2Fgarden",
    );
    expect(legalAcceptanceHref("//evil.example/")).toBe(
      "/auth/terms?next=%2Fgarden",
    );
  });
});
