import { describe, expect, it } from "vitest";

import {
  MEDIA_FOCAL_CENTER,
  OVE330_SERVE_CLASSES,
  OVE330_SERVE_CLASS_VERSION,
  normalizeFocalPoint,
  objectPositionCss,
  resolveMediaFocalPoint,
  resolveMediaPresentation,
} from "./presentation-contract";

describe("normalizeFocalPoint", () => {
  it("returns center for missing or invalid values", () => {
    expect(normalizeFocalPoint(null)).toEqual(MEDIA_FOCAL_CENTER);
    expect(normalizeFocalPoint({ x: Number.NaN, y: 0.2 })).toEqual(
      MEDIA_FOCAL_CENTER,
    );
    expect(normalizeFocalPoint({ x: -0.1, y: 0.5 })).toEqual(
      MEDIA_FOCAL_CENTER,
    );
    expect(normalizeFocalPoint({ x: 0.5, y: 1.1 })).toEqual(MEDIA_FOCAL_CENTER);
  });

  it("keeps in-range coordinates", () => {
    expect(normalizeFocalPoint({ x: 0, y: 1 })).toEqual({ x: 0, y: 1 });
    expect(normalizeFocalPoint({ x: 0.25, y: 0.75 })).toEqual({
      x: 0.25,
      y: 0.75,
    });
  });
});

describe("ove330.serveClass.v1 focal availability", () => {
  it("exports the closed served-class contract", () => {
    expect(OVE330_SERVE_CLASS_VERSION).toBe("ove330.serveClass.v1");
    expect(OVE330_SERVE_CLASSES).toEqual([
      "exact",
      "clamped",
      "low_confidence",
      "generated",
      "homonymous",
      "probe_missing",
      "seam_unmet",
    ]);
  });

  it("serves an out-of-range focal point at centre with an explicit clamped class", () => {
    expect(resolveMediaFocalPoint({ x: -0.1, y: 1.1 })).toEqual({
      focal: MEDIA_FOCAL_CENTER,
      serveClass: "clamped",
    });
    expect(resolveMediaFocalPoint({ x: 0.25, y: 0.75 })).toEqual({
      focal: { x: 0.25, y: 0.75 },
      serveClass: "exact",
    });
  });
});

describe("objectPositionCss", () => {
  it("emits percentage pairs without accepting raw CSS", () => {
    expect(objectPositionCss({ x: 0.25, y: 0.75 })).toBe("25% 75%");
    expect(objectPositionCss({ x: 0, y: 0 })).toBe("0% 0%");
  });

  it("fails closed to center for out-of-range input", () => {
    expect(objectPositionCss({ x: 2, y: 2 })).toBe("50% 50%");
  });
});

describe("resolveMediaPresentation", () => {
  it("uses cover fit with focal object-position", () => {
    const resolved = resolveMediaPresentation({
      mode: "cover",
      focal: { x: 0.1, y: 0.9 },
      intrinsic: { width: 1200, height: 800 },
    });
    expect(resolved.objectFitClass).toBe("object-cover");
    expect(resolved.objectPosition).toBe("10% 90%");
    expect(resolved.intrinsic).toEqual({ width: 1200, height: 800 });
    expect(resolved.serveClass).toBe("exact");
  });

  it("uses contain fit for full-image readback", () => {
    const resolved = resolveMediaPresentation({
      mode: "contain",
      focal: { x: 0.1, y: 0.9 },
    });
    expect(resolved.objectFitClass).toBe("object-contain");
    expect(resolved.objectPosition).toBe("50% 50%");
    expect(resolved.serveClass).toBe("exact");
  });

  it("forwards the clamped class when presentation input is out of range", () => {
    expect(
      resolveMediaPresentation({
        mode: "cover",
        focal: { x: 2, y: 2 },
      }),
    ).toMatchObject({
      focal: MEDIA_FOCAL_CENTER,
      objectPosition: "50% 50%",
      serveClass: "clamped",
    });
  });
});
