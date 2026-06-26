import type { JournalEntry } from "@/db/schema";

export interface JournalEntrySearchDocument {
  id: string;
  body: string;
  userId: string;
  createdAt: string;
  kind: "journal_entry";
}

export function toJournalEntrySearchDocument(
  entry: JournalEntry,
): JournalEntrySearchDocument | null {
  if (entry.visibility !== "public") return null;

  return {
    id: entry.id,
    body: entry.body,
    userId: entry.user_id,
    createdAt: entry.created_at.toISOString(),
    kind: "journal_entry",
  };
}
