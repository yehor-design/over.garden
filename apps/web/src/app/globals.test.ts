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

  it("lets the site header grow around 200% text without shrinking controls", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./globals.css", import.meta.url)),
      "utf8",
    );

    expect(source).toContain(".site-shell-header-inner {\n  min-height: 56px;");
    expect(source).not.toContain(".site-shell-header-inner {\n  height: 56px;");
  });
});
