import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("global responsive floor", () => {
  it("does not force 320px content beyond a viewport narrowed by classic scrollbars", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./globals.css", import.meta.url)),
      "utf8",
    );

    expect(source).not.toContain("min-width: 20rem");
  });
});
