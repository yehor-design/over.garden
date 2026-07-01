import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import {
  normalizeCoarseRegionCode,
  type CoarseRegionCode,
} from "@/lib/garden/regions";

/*
 * TS-side privacy contract fixture only.
 *
 * Runtime writes to the public journal Meilisearch index happen in
 * services/matching/app/search.py:journal_entry_search_document_from_row.
 * This fixture mirrors that shape so TypeScript privacy tests can compare it
 * against contracts/search/public-journal-entry-search-document.json without
 * making this file look like the runtime writer.
 */
export interface JournalEntrySearchContractRow {
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
  coarse_region_code?: string | null;
}

export interface JournalEntrySearchContractDocument {
  id: string;
  title: string;
  body: string;
  publicSlug: string;
  publicPath: string;
  locationVisibility: "region" | "hidden";
  coarseRegionCode?: CoarseRegionCode;
  noindex: boolean;
  entryDate: string;
  createdAt: string;
  kind: "journal_entry";
}

export function buildJournalEntrySearchDocumentContractFixture(
  entry: JournalEntrySearchContractRow,
): JournalEntrySearchContractDocument | null {
  if (entry.visibility !== "public") return null;
  if (entry.lifecycle_state !== "active") return null;
  if (entry.public_gone_at !== null) return null;
  if (!entry.public_slug) return null;
  if (!isPublicLocationVisibility(entry.location_visibility)) return null;
  const coarseRegionCode =
    entry.location_visibility === "region"
      ? normalizeCoarseRegionCode(entry.coarse_region_code)
      : null;
  if (entry.location_visibility === "region" && !coarseRegionCode) {
    return null;
  }

  return {
    id: entry.id,
    title: entry.title,
    body: entry.body,
    publicSlug: entry.public_slug,
    publicPath: publicJournalEntryPath(entry.public_slug),
    locationVisibility: entry.location_visibility,
    ...(coarseRegionCode ? { coarseRegionCode } : {}),
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
