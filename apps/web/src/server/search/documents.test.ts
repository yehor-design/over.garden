import { describe, expect, it } from "vitest";

import type { JournalEntry } from "@/db/schema";
import { toJournalEntrySearchDocument } from "./documents";

function entry(visibility: "private" | "public"): JournalEntry {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    owner_user_id: "00000000-0000-0000-0000-000000000002",
    space_id: "00000000-0000-0000-0000-000000000003",
    plant_object_id: "00000000-0000-0000-0000-000000000004",
    title: "First flowers",
    body: "Помідори чері",
    entry_scope: "object",
    entry_date: new Date("2026-06-25T00:00:00.000Z"),
    visibility,
    client_mutation_id: "test-1",
    created_at: new Date("2026-06-26T00:00:00.000Z"),
    updated_at: new Date("2026-06-26T00:00:00.000Z"),
  };
}

describe("journal entry search documents", () => {
  it("does not index private entries", () => {
    expect(toJournalEntrySearchDocument(entry("private"))).toBeNull();
  });

  it("indexes public entries with a narrow payload", () => {
    expect(toJournalEntrySearchDocument(entry("public"))).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      title: "First flowers",
      body: "Помідори чері",
      ownerUserId: "00000000-0000-0000-0000-000000000002",
      plantObjectId: "00000000-0000-0000-0000-000000000004",
      entryDate: "2026-06-25T00:00:00.000Z",
      createdAt: "2026-06-26T00:00:00.000Z",
      kind: "journal_entry",
    });
  });
});
