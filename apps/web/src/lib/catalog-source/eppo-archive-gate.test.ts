import { describe, expect, it } from "vitest";

import { isEppoArchiveEnabled } from "./eppo-archive-gate";

describe("isEppoArchiveEnabled", () => {
  it("opens only on the literal string true", () => {
    expect(
      isEppoArchiveEnabled({ STABLE_REGISTRY_PUBLIC_DISCOVERY: "true" }),
    ).toBe(true);
  });

  it("stays closed for every other value and for an absent variable", () => {
    for (const value of ["1", "TRUE", "yes", "on", "false", "", undefined]) {
      expect(
        isEppoArchiveEnabled({ STABLE_REGISTRY_PUBLIC_DISCOVERY: value }),
      ).toBe(false);
    }
    expect(isEppoArchiveEnabled({})).toBe(false);
  });
});
