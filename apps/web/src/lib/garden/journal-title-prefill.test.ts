import { describe, expect, it } from "vitest";

import {
  nextJournalTitleValue,
  suggestJournalEntryTitle,
} from "./journal-title-prefill";

describe("journal title prefill", () => {
  it("suggests a photo-start title from object and date without using file metadata", () => {
    const title = suggestJournalEntryTitle({
      entryDate: "2026-07-03",
      objectLabel: "Cherry tomato",
      body: "",
      hasPhoto: true,
    });

    expect(title).toBe("Cherry tomato photo - Jul 3");
    expect(title).not.toContain("tomato.jpg");
    expect(title).not.toContain("quarantine");
  });

  it("uses the first body line while keeping the object context", () => {
    expect(
      suggestJournalEntryTitle({
        entryDate: "2026-07-03",
        objectLabel: "Balcony pepper",
        body: "Two new leaves after repotting.\nSoil stayed moist.",
        hasPhoto: true,
      }),
    ).toBe("Two new leaves after repotting. - Balcony pepper");
  });

  it("keeps a gardener-edited title unchanged", () => {
    const suggestion = suggestJournalEntryTitle({
      entryDate: "2026-07-03",
      objectLabel: "Cherry tomato",
      body: "First flowers opened.",
      hasPhoto: true,
    });

    expect(
      nextJournalTitleValue({
        currentTitle: "My own title",
        suggestion,
        titleEditedByUser: true,
      }),
    ).toBe("My own title");
  });

  it("falls back to a generic photo title and never includes unsafe media context", () => {
    const title = suggestJournalEntryTitle({
      entryDate: "2026-07-03",
      objectLabel: "",
      catalogLabel: "",
      body: "",
      hasPhoto: true,
    });

    expect(title).toBe("Garden photo - Jul 3");
    expect(title).not.toMatch(/filename|quarantine|derivative|gps|latitude/i);
  });

  it("caps long suggestions to the title field limit", () => {
    const title = suggestJournalEntryTitle({
      entryDate: "2026-07-03",
      objectLabel: "A very long balcony tomato label that should be shortened",
      body: "A very long first observation about flowers, stronger stems, soil, watering, and recovery after repotting",
      hasPhoto: true,
    });

    expect(title.length).toBeLessThanOrEqual(140);
    expect(title).not.toMatch(/quarantine|latitude|longitude/i);
  });
});
