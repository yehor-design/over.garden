import { publicJournalEntryPath } from "@/lib/garden/public-paths";

export interface JournalEntrySearchRow {
  id: string;
  title: string;
  body: string;
  public_slug: string | null;
  public_noindex: boolean;
  public_gone_at: Date | string | null;
  entry_date: Date | string;
  created_at: Date | string;
  visibility: "private" | "public" | string;
  lifecycle_state: "active" | "archived" | string;
  location_visibility: "region" | "hidden" | string;
}

export interface JournalEntrySearchDocument {
  id: string;
  title: string;
  body: string;
  publicSlug: string;
  publicPath: string;
  locationVisibility: "region" | "hidden";
  noindex: boolean;
  entryDate: string;
  createdAt: string;
  kind: "journal_entry";
}

export function toJournalEntrySearchDocument(
  entry: JournalEntrySearchRow,
): JournalEntrySearchDocument | null {
  if (entry.visibility !== "public") return null;
  if (entry.lifecycle_state !== "active") return null;
  if (entry.public_gone_at !== null) return null;
  if (!entry.public_slug) return null;
  if (!isPublicLocationVisibility(entry.location_visibility)) return null;

  return {
    id: entry.id,
    title: entry.title,
    body: entry.body,
    publicSlug: entry.public_slug,
    publicPath: publicJournalEntryPath(entry.public_slug),
    locationVisibility: entry.location_visibility,
    noindex: entry.public_noindex,
    entryDate: normalizeDate(entry.entry_date),
    createdAt: normalizeDate(entry.created_at),
    kind: "journal_entry",
  };
}

function isPublicLocationVisibility(
  value: string,
): value is "region" | "hidden" {
  return value === "region" || value === "hidden";
}

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}
