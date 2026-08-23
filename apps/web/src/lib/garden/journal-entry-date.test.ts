import { describe, expect, it } from "vitest";

import { journalEntryDateInputValue } from "@/lib/garden/journal-entry-date";

describe("journalEntryDateInputValue", () => {
  it("serializes a database Date for an HTML date input", () => {
    expect(
      journalEntryDateInputValue(new Date("2026-08-20T00:00:00.000Z")),
    ).toBe("2026-08-20");
  });

  it("keeps the date portion of a database string", () => {
    expect(journalEntryDateInputValue("2026-08-20T00:00:00.000Z")).toBe(
      "2026-08-20",
    );
  });

  it("keeps a PostgreSQL calendar date when local midnight is not UTC midnight", () => {
    expect(journalEntryDateInputValue(new Date(2026, 7, 20))).toBe(
      "2026-08-20",
    );
  });
});
