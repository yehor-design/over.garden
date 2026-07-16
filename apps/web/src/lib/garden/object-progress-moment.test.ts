import { describe, expect, it } from "vitest";

import {
  buildObjectProgressTimeline,
  formatEntryBodyExcerpt,
  isObjectProgressMomentEligible,
  pickProgressPhotoComparison,
  type ObjectProgressTimelineEntry,
} from "./object-progress-moment";

function entry(
  overrides: Partial<ObjectProgressTimelineEntry> &
    Pick<ObjectProgressTimelineEntry, "id">,
): ObjectProgressTimelineEntry {
  return {
    title: "Entry title",
    body: "Entry body text.",
    entryDate: "2026-06-01",
    mediaPublicUrl: null,
    ...overrides,
  };
}

describe("isObjectProgressMomentEligible", () => {
  it("requires at least two entries", () => {
    expect(isObjectProgressMomentEligible(0)).toBe(false);
    expect(isObjectProgressMomentEligible(1)).toBe(false);
    expect(isObjectProgressMomentEligible(2)).toBe(true);
    expect(isObjectProgressMomentEligible(5)).toBe(true);
  });
});

describe("buildObjectProgressTimeline", () => {
  it("orders entries oldest to newest for scanning", () => {
    const timeline = buildObjectProgressTimeline([
      entry({ id: "new", entryDate: "2026-06-15", title: "Latest" }),
      entry({ id: "old", entryDate: "2026-06-01", title: "Earliest" }),
      entry({ id: "mid", entryDate: "2026-06-08", title: "Middle" }),
    ]);

    expect(timeline.map((item) => item.id)).toEqual(["old", "mid", "new"]);
  });
});

describe("formatEntryBodyExcerpt", () => {
  it("trims whitespace and shortens long notes", () => {
    expect(formatEntryBodyExcerpt("  First\n\nsecond line  ")).toBe(
      "First second line",
    );
    expect(formatEntryBodyExcerpt("a".repeat(140), 120)).toHaveLength(120);
    expect(formatEntryBodyExcerpt("a".repeat(140), 120).endsWith("…")).toBe(
      true,
    );
  });
});

describe("pickProgressPhotoComparison", () => {
  it("returns null when fewer than two entries exist", () => {
    expect(pickProgressPhotoComparison([entry({ id: "one" })])).toBeNull();
  });

  it("returns null when only one entry has a photo", () => {
    expect(
      pickProgressPhotoComparison([
        entry({ id: "old", entryDate: "2026-06-01" }),
        entry({
          id: "new",
          entryDate: "2026-06-15",
          mediaPublicUrl: "https://media.over.garden/derivative.webp",
        }),
      ]),
    ).toBeNull();
  });

  it("compares earliest and latest derivative photos when both exist", () => {
    const comparison = pickProgressPhotoComparison([
      entry({
        id: "new",
        entryDate: "2026-06-15",
        mediaPublicUrl: "https://media.over.garden/latest.webp",
      }),
      entry({
        id: "old",
        entryDate: "2026-06-01",
        mediaPublicUrl: "https://media.over.garden/earlier.webp",
      }),
    ]);

    expect(comparison).toEqual({
      earlier: expect.objectContaining({
        id: "old",
        mediaPublicUrl: "https://media.over.garden/earlier.webp",
      }),
      latest: expect.objectContaining({
        id: "new",
        mediaPublicUrl: "https://media.over.garden/latest.webp",
      }),
    });
  });
});
