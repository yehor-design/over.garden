import { describe, expect, it } from "vitest";

import { db } from "@/db";

import { buildTakenJournalEntrySlugsQuery } from "./journal-slug-repository";

describe("the journal entry slug's taken set", () => {
  it("asks for the base and everything suffixed from it, and nothing else", () => {
    const compiled = buildTakenJournalEntrySlugsQuery(
      db,
      "00000000-0000-4000-8000-000000000001",
      "полив-без-календарної-пастки",
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = ');
    expect(compiled.sql).toContain('"journal_entries"."public_slug" is not null');
    expect(compiled.sql).toContain('"journal_entries"."public_slug" = ');
    expect(compiled.sql).toContain('"journal_entries"."public_slug" like ');
    expect(compiled.parameters).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "полив-без-календарної-пастки",
      "полив-без-календарної-пастки-%",
      "current",
      "00000000-0000-4000-8000-000000000001",
      "полив-без-календарної-пастки",
      "полив-без-календарної-пастки-%",
    ]);
  });

  /**
   * Since `0073` the name is the gardener's, and a moved address still
   * answers 308 from its old slug (ADR-0029 D8). A counter that read only the
   * live column would hand that old slug to a second entry of the same
   * gardener, so the old link would silently open a different one. This test
   * fails loudly if the history ever drops out of the taken set again.
   */
  it("reads the slug history under the gardener's current handle as well", () => {
    const compiled = buildTakenJournalEntrySlugsQuery(
      db,
      "00000000-0000-4000-8000-000000000001",
      "томат",
    ).compile();
    expect(compiled.sql).toContain('from "journal_entries"');
    expect(compiled.sql).toContain("union");
    expect(compiled.sql).toContain('"journal_entry_slug_history"');
    expect(compiled.sql).toContain('"user_handle_registry"."lifecycle_state" = ');
  });
});
