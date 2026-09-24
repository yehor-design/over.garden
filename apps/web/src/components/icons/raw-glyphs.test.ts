import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RAW_GLYPH_PATHS, rawGlyphSvg, type RawGlyphName } from "./raw-glyphs";

/** The regular-weight paths the installed Phosphor package draws `name` with. */
function installedRegularPaths(name: RawGlyphName): string[] {
  const require = createRequire(import.meta.url);
  const packageRoot = path.dirname(
    require.resolve("@phosphor-icons/react/package.json"),
  );
  const source = readFileSync(
    path.join(packageRoot, "dist", "defs", `${name}.es.js`),
    "utf8",
  );
  const start = source.indexOf('"regular"');
  expect(start).toBeGreaterThan(-1);
  const weight = source.slice(start, source.indexOf("]", start));
  return [...weight.matchAll(/d: "([^"]+)"/g)].map((match) => match[1]!);
}

describe("raw Phosphor glyphs", () => {
  it("draws every glyph exactly as the installed Phosphor regular weight does", () => {
    for (const name of Object.keys(RAW_GLYPH_PATHS) as RawGlyphName[]) {
      expect(installedRegularPaths(name)).toEqual([RAW_GLYPH_PATHS[name]]);
    }
  });

  it("renders a decorative, focus-free 16 px glyph in the current colour", () => {
    const svg = rawGlyphSvg("Check", "data-lifecycle-glyph");
    expect(svg).toContain('data-lifecycle-glyph="Check"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain('width="16" height="16"');
    expect(svg).toContain('viewBox="0 0 256 256"');
    expect(svg).toContain(`d="${RAW_GLYPH_PATHS.Check}"`);
  });
});
