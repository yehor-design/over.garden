import { describe, expect, it } from "vitest";

import {
  PICK_MEDIAN_MIN_SAMPLE,
  PICK_P95_MIN_SAMPLE,
  PICK_SHARE_MIN_SAMPLE,
  formatPickDuration,
  pickSharePercent,
  readPickFigure,
} from "./pick-latency";

describe("how much measuring makes a figure (OVE-506, OG-UX-039)", () => {
  it("asks five picks of a median, twenty of a P95 and five of a share", () => {
    expect(PICK_MEDIAN_MIN_SAMPLE).toBe(5);
    expect(PICK_P95_MIN_SAMPLE).toBe(20);
    expect(PICK_SHARE_MIN_SAMPLE).toBe(5);
  });

  it("is no figure at all when nothing was measured", () => {
    expect(readPickFigure(null, 0, PICK_MEDIAN_MIN_SAMPLE)).toEqual({
      status: "none",
    });
    // A value over no sample is not a measurement: a zero from an empty
    // window would read as an instant pick.
    expect(readPickFigure(0, 0, PICK_MEDIAN_MIN_SAMPLE)).toEqual({
      status: "none",
    });
    expect(readPickFigure(1200, -1, PICK_MEDIAN_MIN_SAMPLE)).toEqual({
      status: "none",
    });
    expect(readPickFigure(null, 7, PICK_MEDIAN_MIN_SAMPLE)).toEqual({
      status: "none",
    });
  });

  it("says how many a median had and needs, one short of the threshold", () => {
    // Production's 29672 ms median was one attempt: never a figure.
    expect(readPickFigure(29672, 1, PICK_MEDIAN_MIN_SAMPLE)).toEqual({
      status: "insufficient",
      sample: 1,
      needed: 5,
    });
    expect(readPickFigure(900, 4, PICK_MEDIAN_MIN_SAMPLE)).toEqual({
      status: "insufficient",
      sample: 4,
      needed: 5,
    });
  });

  it("calls a median a median at exactly five", () => {
    expect(readPickFigure(900, 5, PICK_MEDIAN_MIN_SAMPLE)).toEqual({
      status: "measured",
      value: 900,
      sample: 5,
    });
  });

  it("holds a P95 back until twenty, and calls it one at exactly twenty", () => {
    expect(readPickFigure(29672, 1, PICK_P95_MIN_SAMPLE)).toEqual({
      status: "insufficient",
      sample: 1,
      needed: 20,
    });
    expect(readPickFigure(4200, 19, PICK_P95_MIN_SAMPLE)).toEqual({
      status: "insufficient",
      sample: 19,
      needed: 20,
    });
    expect(readPickFigure(4200, 20, PICK_P95_MIN_SAMPLE)).toEqual({
      status: "measured",
      value: 4200,
      sample: 20,
    });
  });

  it("gives a share no percentage below five attempts", () => {
    // "1 of 1" is not "100%".
    expect(pickSharePercent(1, 1)).toBeNull();
    expect(pickSharePercent(4, 4)).toBeNull();
    expect(pickSharePercent(0, 0)).toBeNull();
    expect(pickSharePercent(1, 5)).toBe(20);
    expect(pickSharePercent(5, 5)).toBe(100);
    expect(pickSharePercent(0, 5)).toBe(0);
    expect(pickSharePercent(5, 6)).toBe(83);
  });
});

describe("a duration as a person says it (OVE-506)", () => {
  it.each([
    ["uk", "0,4 с", "29,7 с", "2 хв 5 с", "2 хв"],
    ["bg", "0,4 с", "29,7 с", "2 мин 5 с", "2 мин"],
    ["ru", "0,4 с", "29,7 с", "2 мин 5 с", "2 мин"],
  ] as const)(
    "in %s: seconds with one decimal, minutes and seconds beyond one minute",
    (locale, short, long, minutes, wholeMinutes) => {
      expect(formatPickDuration(400, locale)).toBe(short);
      expect(formatPickDuration(29672, locale)).toBe(long);
      expect(formatPickDuration(125000, locale)).toBe(minutes);
      expect(formatPickDuration(120000, locale)).toBe(wholeMinutes);
    },
  );

  it("never prints the raw milliseconds", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      expect(formatPickDuration(29672, locale)).not.toContain("29672");
      expect(formatPickDuration(29672, locale)).not.toContain("ms");
    }
  });

  it("decides on the rounded value, so a hair under a minute is a minute", () => {
    // 59 960 ms rounds to 60,0 seconds; that is "1 хв", never "60,0 с".
    expect(formatPickDuration(59_960, "uk")).toBe("1 хв");
    expect(formatPickDuration(59_949, "uk")).toBe("59,9 с");
  });

  it("reads a negative duration as none rather than as a negative time", () => {
    expect(formatPickDuration(-250, "uk")).toBe("0,0 с");
  });
});
