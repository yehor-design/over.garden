import { describe, expect, it } from "vitest";

import type { JournalEntry } from "@/db/schema";
import { toJournalEntrySearchDocument } from "./documents";

function entry(visibility: "private" | "public"): JournalEntry {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    user_id: "00000000-0000-0000-0000-000000000002",
    body: "Помідори чері",
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
      body: "Помідори чері",
      userId: "00000000-0000-0000-0000-000000000002",
      createdAt: "2026-06-26T00:00:00.000Z",
      kind: "journal_entry",
    });
  });
});
