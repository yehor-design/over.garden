import { describe, expect, it } from "vitest";

import { canonicalLowerCasePath } from "./canonical-case";

describe("the lower-case address (ADR-0029 D3)", () => {
  it.each([
    ["/topics/PLANTS", "/topics/plants"],
    ["/bg/topics/PLANTS", "/bg/topics/plants"],
    ["/@YEHOR", "/@yehor"],
    ["/ru/@Yehor_Design", "/ru/@yehor_design"],
    ["/species/Solanum-Lycopersicum", "/species/solanum-lycopersicum"],
    ["/species/Solanum/De-Barao", "/species/solanum/de-barao"],
    ["/variety/De-Barao", "/variety/de-barao"],
    ["/breed/Apis-Mellifera", "/breed/apis-mellifera"],
    ["/communities/Observation-And-Care", "/communities/observation-and-care"],
    ["/journal/Polyv", "/journal/polyv"],
  ])("308s %s to %s", (from, to) => {
    expect(canonicalLowerCasePath(from)).toBe(to);
  });

  /**
   * The reason this decodes first. `%D0%9F` is an upper-case `П`; lower-casing
   * the encoded string would rewrite the escape to `%d0%9f` — a different
   * spelling of the same byte — and leave the letter itself untouched.
   */
  it("lower-cases the letter, not the percent escape", () => {
    expect(canonicalLowerCasePath(`/topics/${encodeURIComponent("Помідори")}`)).toBe(
      `/topics/${encodeURIComponent("помідори")}`,
    );
    expect(canonicalLowerCasePath(`/topics/${encodeURIComponent("помідори")}`)).toBeNull();
    expect(canonicalLowerCasePath("/topics/%D0%BF%D0%BE%D0%BC")).toBeNull();
  });

  it("says nothing about an address that is already canonical", () => {
    for (const path of [
      "/topics/plants",
      "/bg/topics/plants",
      "/@yehor",
      "/species/solanum-lycopersicum",
      "/communities/observation-and-care",
    ]) {
      expect(canonicalLowerCasePath(path), path).toBeNull();
    }
  });

  it("leaves the prefixes the manifest does not own alone", () => {
    for (const path of [
      "/sources/eppo/SOLLC",
      "/api/Public/Catalog",
      "/garden/Objects/ABC",
      "/id/3F2504E0-4F89-41D3-9A0C-0305E82C3301",
      "/markets/BG",
      "/",
      "/bg",
    ]) {
      expect(canonicalLowerCasePath(path), path).toBeNull();
    }
  });

  it("leaves a segment it cannot decode to the 404 that follows it", () => {
    expect(canonicalLowerCasePath("/topics/%E0%A4%A")).toBeNull();
  });

  it("says nothing about the bare section root", () => {
    expect(canonicalLowerCasePath("/topics/")).toBeNull();
    expect(canonicalLowerCasePath("/species/")).toBeNull();
  });
});
