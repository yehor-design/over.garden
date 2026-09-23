import { describe, expect, it } from "vitest";

import { entryCardDates, getEntryCardCopy } from "./entry-card-dates";

describe("a card's dates (OVE-492, OG-UX-016)", () => {
  it("leads with the observation and adds publication only on another day", () => {
    const sameDay = entryCardDates(
      "uk",
      "2026-09-12",
      "2026-09-12T18:40:00.000Z",
    );
    expect(sameDay).toEqual({
      dateTime: "2026-09-12",
      dateLabel: "12 вер. 2026 р.",
      published: null,
    });

    const backdated = entryCardDates(
      "uk",
      "2026-05-03",
      "2026-09-12T18:40:00.000Z",
    );
    expect(backdated.dateLabel).toBe("3 трав. 2026 р.");
    expect(backdated.published).toEqual({
      dateTime: "2026-09-12T18:40:00.000Z",
      label: "Опубліковано 12 вер. 2026 р.",
    });
  });

  it("speaks the interface's language, not the entry's", () => {
    expect(
      entryCardDates("bg", "2026-05-03", "2026-09-12T10:00:00.000Z").published
        ?.label,
    ).toBe("Публикувано 12.09.2026 г.");
    expect(
      entryCardDates("ru", "2026-05-03", "2026-09-12T10:00:00.000Z").published
        ?.label,
    ).toMatch(/^Опубликовано 12 /u);
  });

  it("reads a date column as the day it names, whatever the server's zone", () => {
    expect(entryCardDates("uk", "2026-01-01", null)).toEqual({
      dateTime: "2026-01-01",
      dateLabel: "1 січ. 2026 р.",
      published: null,
    });
    // What node-postgres hands back for a `date` column: local midnight.
    expect(entryCardDates("uk", new Date(2026, 0, 1), null).dateTime).toBe(
      "2026-01-01",
    );
  });

  it("names Read more in each language", () => {
    expect(getEntryCardCopy("uk").readMore).toBe("Читати далі");
    expect(getEntryCardCopy("bg").readMore).toBe("Прочети още");
    expect(getEntryCardCopy("ru").readMore).toBe("Читать далее");
  });
});
