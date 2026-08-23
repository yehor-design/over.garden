import { describe, expect, it } from "vitest";

import { orientRgbaPixels } from "./journal-image-codec";

describe("orientRgbaPixels", () => {
  const source = {
    data: new Uint8ClampedArray([
      1, 0, 0, 255,
      2, 0, 0, 255,
      3, 0, 0, 255,
      4, 0, 0, 255,
      5, 0, 0, 255,
      6, 0, 0, 255,
    ]),
    width: 3,
    height: 2,
  };

  it.each([
    [1, 3, 2, [1, 2, 3, 4, 5, 6]],
    [2, 3, 2, [3, 2, 1, 6, 5, 4]],
    [3, 3, 2, [6, 5, 4, 3, 2, 1]],
    [4, 3, 2, [4, 5, 6, 1, 2, 3]],
    [5, 2, 3, [1, 4, 2, 5, 3, 6]],
    [6, 2, 3, [4, 1, 5, 2, 6, 3]],
    [7, 2, 3, [6, 3, 5, 2, 4, 1]],
    [8, 2, 3, [3, 6, 2, 5, 1, 4]],
  ])(
    "applies EXIF orientation %i exactly once",
    (orientation, width, height, expected) => {
      const result = orientRgbaPixels(source, orientation);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(Array.from(result.data).filter((_, index) => index % 4 === 0)).toEqual(
        expected,
      );
    },
  );
});
