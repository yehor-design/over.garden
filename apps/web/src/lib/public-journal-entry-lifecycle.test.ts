import { describe, expect, it } from "vitest";

import {
  matchPublicJournalEntryPath,
  renderGonePublicJournalEntryHtml,
  renderNotFoundPublicJournalEntryHtml,
} from "./public-journal-entry-lifecycle";

describe("public journal entry HTTP lifecycle", () => {
  it("matches exact root and localized journal documents", () => {
    expect(matchPublicJournalEntryPath("/journal/first-harvest")).toBe(
      "first-harvest",
    );
    expect(matchPublicJournalEntryPath("/bg/journal/first-harvest/")).toBe(
      "first-harvest",
    );
    expect(matchPublicJournalEntryPath("/ru/journal/private-label")).toBe(
      "private-label",
    );
    expect(matchPublicJournalEntryPath("/journal/entry/extra")).toBeNull();
    expect(matchPublicJournalEntryPath("/garden/journal/entry")).toBeNull();
  });

  it("renders one generic localized 404 for unknown and private entries", () => {
    const html = renderNotFoundPublicJournalEntryHtml("bg");

    expect(html).toContain("Записът не е намерен");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain('href="/bg/journals"');
    expect(html).not.toMatch(
      /private|owner|email|entryId|spaceId|location|region|media/i,
    );
  });

  it("renders a localized 410 without leaked chapter or author payload", () => {
    const html = renderGonePublicJournalEntryHtml("uk");

    expect(html).toContain("Запис видалено");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain('href="/journals"');
    expect(html).not.toMatch(
      /entryId|owner|email|location|region|coordinates|journal body|media/i,
    );
  });
});
