import { describe, expect, it } from "vitest";

import {
  buildPublicMediaSourceSet,
  expandDerivativeObjectKeys,
  normalizeVariantLongEdges,
  variantDerivativeKey,
} from "./derivative-keys";

const PRIMARY = "derivatives/8f5fa87d-b94e-4217-b68d-28303827ad89/3.webp";

describe("derivative keys", () => {
  it("places a variant next to its primary and keeps unknown edges out", () => {
    expect(variantDerivativeKey(PRIMARY, 1280)).toBe(
      "derivatives/8f5fa87d-b94e-4217-b68d-28303827ad89/3-1280.webp",
    );
    expect(() => variantDerivativeKey("derivatives/x/3.png", 480)).toThrow(
      "derivative_key_invalid",
    );
    expect(normalizeVariantLongEdges([480, 999, 1280, 480])).toEqual([
      1280, 480,
    ]);
    expect(normalizeVariantLongEdges(null)).toEqual([]);
    expect(expandDerivativeObjectKeys(PRIMARY, [480])).toEqual([
      PRIMARY,
      "derivatives/8f5fa87d-b94e-4217-b68d-28303827ad89/3-480.webp",
    ]);
    expect(expandDerivativeObjectKeys(PRIMARY, null)).toEqual([PRIMARY]);
  });

  it("builds srcset candidates at the encoded widths, smallest first", () => {
    expect(
      buildPublicMediaSourceSet({
        publicUrl: `https://media.over.garden/${PRIMARY}`,
        intrinsicWidth: 1920,
        intrinsicHeight: 2560,
        variantLongEdges: [1280, 480],
      }),
    ).toEqual({
      src: `https://media.over.garden/${PRIMARY}`,
      srcSet: [
        "https://media.over.garden/derivatives/8f5fa87d-b94e-4217-b68d-28303827ad89/3-480.webp 360w",
        "https://media.over.garden/derivatives/8f5fa87d-b94e-4217-b68d-28303827ad89/3-1280.webp 960w",
        `https://media.over.garden/${PRIMARY} 1920w`,
      ].join(", "),
    });
  });

  it("falls back to the primary alone without variants or a known size", () => {
    expect(
      buildPublicMediaSourceSet({
        publicUrl: "https://media.over.garden/x.webp",
        intrinsicWidth: 800,
        intrinsicHeight: 600,
        variantLongEdges: [],
      }),
    ).toEqual({ src: "https://media.over.garden/x.webp", srcSet: null });
    expect(
      buildPublicMediaSourceSet({
        publicUrl: "https://media.over.garden/x.webp",
        intrinsicWidth: null,
        intrinsicHeight: null,
        variantLongEdges: [1280],
      }).srcSet,
    ).toBeNull();
    // A 1280 variant of a 1280-wide primary would be an upscale; it is skipped.
    expect(
      buildPublicMediaSourceSet({
        publicUrl: "https://media.over.garden/x.webp",
        intrinsicWidth: 1280,
        intrinsicHeight: 960,
        variantLongEdges: [1280, 480],
      }).srcSet,
    ).toBe(
      "https://media.over.garden/x-480.webp 480w, https://media.over.garden/x.webp 1280w",
    );
  });
});
