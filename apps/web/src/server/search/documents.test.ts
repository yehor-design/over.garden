import { describe, expect, it } from "vitest";

import {
  toJournalEntrySearchDocument,
  type JournalEntrySearchRow,
} from "./documents";

function entry(
  visibility: "private" | "public",
  overrides: Partial<JournalEntrySearchRow> = {},
): JournalEntrySearchRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "First flowers",
    body: "Помідори чері",
    public_slug: "first-flowers-abc123",
    public_noindex: true,
    public_gone_at: null,
    entry_date: new Date("2026-06-25T00:00:00.000Z"),
    visibility,
    lifecycle_state: "active",
    location_visibility: "hidden",
    created_at: new Date("2026-06-26T00:00:00.000Z"),
    ...overrides,
  };
}

describe("journal entry search documents", () => {
  it("does not index private entries", () => {
    expect(toJournalEntrySearchDocument(entry("private"))).toBeNull();
  });

  it("does not index public entries until a public slug exists", () => {
    expect(
      toJournalEntrySearchDocument(entry("public", { public_slug: null })),
    ).toBeNull();
  });

  it("does not index archived public entries", () => {
    expect(
      toJournalEntrySearchDocument(
        entry("public", { lifecycle_state: "archived" }),
      ),
    ).toBeNull();
  });

  it("does not index public-gone entries", () => {
    expect(
      toJournalEntrySearchDocument(
        entry("public", {
          public_gone_at: new Date("2026-06-26T12:00:00.000Z"),
        }),
      ),
    ).toBeNull();
  });

  it("does not index entries with unsafe location visibility", () => {
    expect(
      toJournalEntrySearchDocument(
        entry("public", { location_visibility: "exact" }),
      ),
    ).toBeNull();
  });

  it("indexes public entries with a narrow payload", () => {
    const document = toJournalEntrySearchDocument(entry("public"));

    expect(document).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      title: "First flowers",
      body: "Помідори чері",
      publicSlug: "first-flowers-abc123",
      publicPath: "/journal/first-flowers-abc123",
      locationVisibility: "hidden",
      noindex: true,
      entryDate: "2026-06-25T00:00:00.000Z",
      createdAt: "2026-06-26T00:00:00.000Z",
      kind: "journal_entry",
    });
    expect(document).not.toHaveProperty("ownerUserId");
    expect(document).not.toHaveProperty("plantObjectId");
    expect(document).not.toHaveProperty("quarantineKey");
  });
});
