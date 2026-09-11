import { describe, expect, it } from "vitest";

import { db } from "@/db";

import { buildTakenJournalEntrySlugsQuery } from "./journal-slug-repository";

describe("the journal entry slug's taken set", () => {
  it("asks for the base and everything suffixed from it, and nothing else", () => {
    const compiled = buildTakenJournalEntrySlugsQuery(
      db,
      "полив-без-календарної-пастки",
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."public_slug" is not null');
    expect(compiled.sql).toContain('"journal_entries"."public_slug" = ');
    expect(compiled.sql).toContain('"journal_entries"."public_slug" like ');
    expect(compiled.parameters).toEqual([
      "полив-без-календарної-пастки",
      "полив-без-календарної-пастки-%",
    ]);
  });

  /**
   * The query reads the live column rather than a history table, because the
   * namespace has no history table until `OVE-428`. That is only correct while
   * nothing re-slugs an entry — the moment something does, a retired slug is
   * free again and the counter would hand it to a second entry, which breaks
   * the 308 the old address is supposed to answer with. This test is here to
   * fail loudly if that assumption is ever quietly dropped.
   */
  it("reads journal_entries, which is the whole slug history today", () => {
    const compiled = buildTakenJournalEntrySlugsQuery(db, "томат").compile();
    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).not.toContain("journal_entry_slug_history");
  });
});
