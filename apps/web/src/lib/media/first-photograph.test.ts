import { describe, expect, it } from "vitest";

import { firstPhotographIndex } from "./first-photograph";

const card = (photographs: number) => ({ media: Array(photographs).fill("p") });
const hasPhotograph = (entry: { media: unknown[] }) => entry.media.length > 0;

describe("the photograph a listing asks for first (OVE-470)", () => {
  it("is the first card's, when the first card has one", () => {
    expect(firstPhotographIndex([card(1), card(1)], hasPhotograph)).toBe(0);
  });

  it("is the second card's when the first card is words only", () => {
    // The defect this exists for: `priority={index === 0}` gave the priority to
    // a card with nothing to load, and left the photograph under it lazy.
    expect(firstPhotographIndex([card(0), card(2)], hasPhotograph)).toBe(1);
  });

  it("is nobody's once the first photograph is below the first screen", () => {
    expect(
      firstPhotographIndex([card(0), card(0), card(1)], hasPhotograph),
    ).toBe(-1);
    expect(firstPhotographIndex([], hasPhotograph)).toBe(-1);
  });

  it("looks as far as it is told to", () => {
    expect(
      firstPhotographIndex([card(0), card(0), card(1)], hasPhotograph, 3),
    ).toBe(2);
  });
});
