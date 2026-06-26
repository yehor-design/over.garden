import { describe, expect, it } from "vitest";

import {
  gardenFirstEntryHomepagePath,
  gardenFirstEntryPreselectionPath,
} from "./public-paths";

describe("garden public paths", () => {
  it("builds a homepage start path with enum-only source attribution", () => {
    expect(gardenFirstEntryHomepagePath()).toBe("/garden?source=homepage");
  });

  it("builds public variety preselection without raw referrer or display text", () => {
    const path = gardenFirstEntryPreselectionPath("pomidor-cheri-0000000101");

    expect(path).toBe(
      "/garden?catalog=pomidor-cheri-0000000101&source=public-variety",
    );
    expect(path).not.toContain("referrer");
    expect(path).not.toContain("display");
    expect(path).not.toContain("title");
  });
});
