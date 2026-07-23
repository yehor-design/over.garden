import { describe, expect, it } from "vitest";

import {
  GEIST_MONO_ASSET_MANIFEST,
  GEIST_MONO_FAMILY,
  GEIST_MONO_FONT_FACE_CSS,
  GEIST_MONO_PRELOAD_ASSETS,
  GEIST_MONO_STACK,
} from "./geist-mono-contract";

describe("Geist Mono asset contract", () => {
  it("pins all six official v6 normal subsets", () => {
    expect(GEIST_MONO_ASSET_MANIFEST).toMatchObject({
      contractVersion: "TypographyAssetManifestV1",
      issue: "OVE-208",
      role: "semantic-monospace",
      family: "Geist Mono",
      upstreamFamily: "Geist Mono",
      license: { spdx: "OFL-1.1", bytes: 4_481 },
      binary: {
        version: "Version 1.701",
        style: "Regular",
        postscriptName: "GeistMono-Regular",
        unitsPerEm: 1_000,
      },
      axes: { weight: { min: 100, default: 400, max: 900 } },
      loading: { strategy: "demand-only", preloadCount: 0 },
    });
    expect(GEIST_MONO_ASSET_MANIFEST.assets.map((asset) => asset.id)).toEqual([
      "normal-cyrillic-ext",
      "normal-cyrillic",
      "normal-symbols2",
      "normal-vietnamese",
      "normal-latin-ext",
      "normal-latin",
    ]);
    expect(
      GEIST_MONO_ASSET_MANIFEST.assets.every(
        (asset) =>
          asset.sourceUrl.includes("/s/geistmono/v6/") &&
          asset.publicPath.startsWith("/fonts/geist-mono/v6/"),
      ),
    ).toBe(true);
    expect(
      GEIST_MONO_ASSET_MANIFEST.assets.reduce(
        (total, asset) => total + asset.bytes,
        0,
      ),
    ).toBe(70_516);
  });

  it("exports the semantic monospace stack and never preloads it", () => {
    expect(GEIST_MONO_FAMILY).toBe("Geist Mono");
    expect(GEIST_MONO_STACK).toBe(
      '"Geist Mono", ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    );
    expect(GEIST_MONO_PRELOAD_ASSETS).toEqual([]);
    expect(
      GEIST_MONO_ASSET_MANIFEST.assets.every((asset) => !asset.preload),
    ).toBe(true);
  });

  it("generates only same-origin normal variable faces", () => {
    expect(GEIST_MONO_FONT_FACE_CSS).not.toMatch(/https?:\/\//u);
    expect(GEIST_MONO_FONT_FACE_CSS.match(/@font-face\s*\{/gu)).toHaveLength(6);
    expect(
      GEIST_MONO_FONT_FACE_CSS.match(/font-display:\s*swap;/gu),
    ).toHaveLength(6);
    expect(
      GEIST_MONO_FONT_FACE_CSS.match(/font-style:\s*normal;/gu),
    ).toHaveLength(6);
    expect(GEIST_MONO_FONT_FACE_CSS).not.toMatch(
      /font-style:\s*(?:italic|oblique)/u,
    );
  });
});
