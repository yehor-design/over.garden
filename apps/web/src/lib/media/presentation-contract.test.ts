import { describe, expect, it } from "vitest";

import {
  MEDIA_FOCAL_CENTER,
  normalizeFocalPoint,
  objectPositionCss,
  resolveMediaPresentation,
} from "./presentation-contract";
import {
  meetsLaunchMediaQuality,
  MIN_LAUNCH_MEDIA_SHORT_SIDE_PX,
} from "./image-limits";

describe("normalizeFocalPoint", () => {
  it("returns center for missing or invalid values", () => {
    expect(normalizeFocalPoint(null)).toEqual(MEDIA_FOCAL_CENTER);
    expect(normalizeFocalPoint({ x: Number.NaN, y: 0.2 })).toEqual(
      MEDIA_FOCAL_CENTER,
    );
    expect(normalizeFocalPoint({ x: -0.1, y: 0.5 })).toEqual(MEDIA_FOCAL_CENTER);
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
  });

  it("uses contain fit for full-image readback", () => {
    const resolved = resolveMediaPresentation({
      mode: "contain",
      focal: { x: 0.1, y: 0.9 },
    });
    expect(resolved.objectFitClass).toBe("object-contain");
    expect(resolved.objectPosition).toBe("50% 50%");
  });
});

describe("meetsLaunchMediaQuality", () => {
  it("rejects tiny placeholders", () => {
    expect(meetsLaunchMediaQuality({ width: 10, height: 10 })).toBe(false);
    expect(
      meetsLaunchMediaQuality({
        width: MIN_LAUNCH_MEDIA_SHORT_SIDE_PX - 1,
        height: 200,
      }),
    ).toBe(false);
  });

  it("accepts launch-quality dimensions", () => {
    expect(meetsLaunchMediaQuality({ width: 64, height: 64 })).toBe(true);
    expect(meetsLaunchMediaQuality({ width: 800, height: 600 })).toBe(true);
  });
});
