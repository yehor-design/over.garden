import { describe, expect, it } from "vitest";

import { SCREEN_STATES } from "./screen-state";

/**
 * The six names are a contract between every page-family task of this slice.
 * Renaming one silently would let two screens disagree about what "empty"
 * means — which is how a first-run message ended up on a filtered search that
 * matched nothing.
 */
describe("the six states of DESIGN.md §5.4", () => {
  it("is closed, and in the order the canon lists them", () => {
    expect(SCREEN_STATES).toEqual([
      "empty-first-run",
      "empty-no-results",
      "loading",
      "degraded",
      "error",
      "signed-out",
    ]);
  });

  it("tells the two empties apart, which is the whole reason it exists", () => {
    expect(SCREEN_STATES).toContain("empty-first-run");
    expect(SCREEN_STATES).toContain("empty-no-results");
  });
});
