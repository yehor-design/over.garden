import { Fragment, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  GOOGLE_SANS_ASSET_MANIFEST,
  GOOGLE_SANS_FAMILY,
  GOOGLE_SANS_FALLBACK_FAMILY,
  GOOGLE_SANS_FONT_FACE_CSS,
  GOOGLE_SANS_PRELOAD_ASSETS,
  GOOGLE_SANS_STACK,
} from "./google-sans-contract";
import { GoogleSansPreloads } from "./google-sans-preloads";

describe("Google Sans asset contract", () => {
  it("pins all required official v69 styles and subsets", () => {
    expect(GOOGLE_SANS_ASSET_MANIFEST).toMatchObject({
      contractVersion: "TypographyAssetManifestV1",
      issue: "OVE-208",
      family: "Google Sans",
      upstreamFamily: "Google Sans",
      license: { spdx: "OFL-1.1", bytes: 4_394 },
      binary: {
        version: "Version 13.002;[5e3df34c1]",
        unitsPerEm: 1_000,
      },
    });
    expect(GOOGLE_SANS_ASSET_MANIFEST.assets.map((asset) => asset.id)).toEqual([
      "normal-cyrillic-ext",
      "normal-cyrillic",
      "normal-latin-ext",
      "normal-latin",
      "italic-cyrillic-ext",
      "italic-cyrillic",
      "italic-latin-ext",
      "italic-latin",
    ]);
    expect(
      GOOGLE_SANS_ASSET_MANIFEST.assets.every(
        (asset) =>
          asset.sourceUrl.includes("/s/googlesans/v69/") &&
          asset.publicPath.startsWith("/fonts/google-sans/v69/"),
      ),
    ).toBe(true);
  });

  it("exports the primary, fallback, and semantic stack tokens", () => {
    expect(GOOGLE_SANS_FAMILY).toBe("Google Sans");
    expect(GOOGLE_SANS_FALLBACK_FAMILY).toBe("Google Sans Fallback");
    expect(GOOGLE_SANS_STACK).toBe(
      '"Google Sans", "Google Sans Fallback", Arial, sans-serif',
    );
    expect(GOOGLE_SANS_ASSET_MANIFEST.fallback).toMatchObject({
      sourceFamily: "Arial",
      azAverageWidth: 463.3953488372093,
      sizeAdjust: "101.55%",
      ascentOverride: "95.12%",
      descentOverride: "28.16%",
      lineGapOverride: "0.00%",
    });
  });

  it("preloads only the normal core assets with matching CORS metadata", () => {
    expect(GOOGLE_SANS_PRELOAD_ASSETS.map((asset) => asset.id)).toEqual([
      "normal-cyrillic",
    ]);

    const markup = renderToStaticMarkup(
      createElement(Fragment, null, createElement(GoogleSansPreloads)),
    );
    expect(markup.match(/rel="preload"/gu)).toHaveLength(1);
    expect(markup.match(/as="font"/gu)).toHaveLength(1);
    expect(markup.match(/type="font\/woff2"/gu)).toHaveLength(1);
    expect(markup.match(/crossorigin=""/gu)).toHaveLength(1);
    expect(markup.match(/referrerPolicy="no-referrer"/gu)).toHaveLength(1);
    expect(markup).toContain("normal-cyrillic");
    expect(markup).not.toContain("italic");
    expect(markup).not.toContain("latin-ext");
    expect(markup).not.toContain("cyrillic-ext");
  });

  it("generates only same-origin real Roman and Italic faces", () => {
    expect(GOOGLE_SANS_FONT_FACE_CSS).not.toMatch(/https?:\/\//u);
    // Eight real assets plus the default and Cyrillic fallback faces.
    expect(GOOGLE_SANS_FONT_FACE_CSS.match(/@font-face\s*\{/gu)).toHaveLength(
      10,
    );
    expect(
      GOOGLE_SANS_FONT_FACE_CSS.match(/font-display:\s*swap;/gu),
    ).toHaveLength(8);
    expect(
      GOOGLE_SANS_FONT_FACE_CSS.match(/font-style:\s*italic;/gu),
    ).toHaveLength(4);
    expect(GOOGLE_SANS_FONT_FACE_CSS).not.toContain("oblique");
  });
});
