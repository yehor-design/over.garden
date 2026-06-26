import type { JournalEntry } from "@/db/schema";

export interface JournalEntrySearchDocument {
  id: string;
  title: string;
  body: string;
  ownerUserId: string;
  plantObjectId: string;
  entryDate: string;
  createdAt: string;
  kind: "journal_entry";
}

export function toJournalEntrySearchDocument(
  entry: JournalEntry,
): JournalEntrySearchDocument | null {
  if (entry.visibility !== "public") return null;

  return {
    id: entry.id,
    title: entry.title,
    body: entry.body,
    ownerUserId: entry.owner_user_id,
    plantObjectId: entry.plant_object_id,
    entryDate: entry.entry_date.toISOString(),
    createdAt: entry.created_at.toISOString(),
    kind: "journal_entry",
  };
}
