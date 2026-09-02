import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import {
  normalizeCoarseRegionCode,
  type CoarseRegionCode,
} from "@/lib/garden/regions";
import {
  searchProjectionQuality,
  type PublicProjectionQualityClass,
  type PublicProjectionQualityReason,
} from "@/lib/public-projection-quality";
import { isSafeJournalSearchDocumentId } from "@/server/search/public-journal-document-id";

/*
 * TS-side privacy contract fixture only.
 *
 * Runtime writes to the public journal Meilisearch index happen in
 * services/matching/app/search.py:journal_entry_search_document_from_row.
 * This fixture mirrors that shape so TypeScript privacy tests can compare it
 * against contracts/search/public-journal-entry-search-document.json without
 * making this file look like the runtime writer.
 */

export type JournalSearchCoverSource =
  | "automatic_inline"
  | "explicit_inline"
  | "separate"
  | "none";

export interface JournalEntrySearchContractRow {
  id: string;
  title: string;
  body: string;
  public_slug: string | null;
  public_noindex: boolean;
  public_gone_at: Date | string | null;
  published_at: Date | string | null;
  entry_date: Date | string;
  entry_scope: "object" | "space" | string;
  created_at: Date | string;
  visibility: "public" | string;
  lifecycle_state: "active" | "deleted_retention" | string;
  location_visibility: "region" | "hidden" | string;
  coarse_region_code?: string | null;
  owner_profile_public_safe: boolean;
  cover_source?: JournalSearchCoverSource | null;
  cover_public_url?: string | null;
  cover_projection_quality?: PublicProjectionQualityClass | null;
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
  entryScope: "object" | "space";
  createdAt: string;
  kind: "journal_entry";
  coverSource: JournalSearchCoverSource;
  coverPublicUrl?: string;
  qualityClass: PublicProjectionQualityClass;
  qualityReasons: PublicProjectionQualityReason[];
}

export function buildJournalEntrySearchDocumentContractFixture(
  entry: JournalEntrySearchContractRow,
): JournalEntrySearchContractDocument | null {
  if (!isSafeJournalSearchDocumentId(entry.id)) return null;
  if (entry.visibility !== "public") return null;
  if (entry.lifecycle_state !== "active") return null;
  if (entry.public_gone_at !== null) return null;
  if (entry.published_at == null) return null;
  if (!entry.owner_profile_public_safe) return null;
  if (!entry.public_slug) return null;
  if (!entry.title.trim() || !entry.body.trim()) return null;
  if (!isPublicEntryScope(entry.entry_scope)) return null;
  if (!isPublicLocationVisibility(entry.location_visibility)) return null;
  const normalizedCoarseRegionCode =
    entry.location_visibility === "region"
      ? normalizeCoarseRegionCode(entry.coarse_region_code)
      : null;
  const qualityReasons: PublicProjectionQualityReason[] = [];
  const locationVisibility =
    entry.location_visibility === "region" && !normalizedCoarseRegionCode
      ? "hidden"
      : entry.location_visibility;
  const coarseRegionCode =
    locationVisibility === "region" ? normalizedCoarseRegionCode : null;
  if (entry.location_visibility === "region" && !normalizedCoarseRegionCode) {
    qualityReasons.push("coarse_region_unavailable");
  }

  const requestedCoverSource = normalizeCoverSource(entry.cover_source);
  const normalizedCoverPublicUrl =
    requestedCoverSource === "none"
      ? null
      : normalizeCoverPublicUrl(entry.cover_public_url);
  const coverProjectionResolved =
    requestedCoverSource === "none" ||
    (normalizedCoverPublicUrl !== null &&
      entry.cover_projection_quality !== "unverified");
  const coverSource = coverProjectionResolved ? requestedCoverSource : "none";
  const coverPublicUrl = coverProjectionResolved
    ? normalizedCoverPublicUrl
    : null;
  if (
    !coverProjectionResolved ||
    entry.cover_projection_quality === "partial"
  ) {
    qualityReasons.push("media_projection_unresolved");
  }
  const quality = searchProjectionQuality(qualityReasons);

  return {
    id: entry.id.toLowerCase(),
    title: entry.title,
    body: entry.body,
    publicSlug: entry.public_slug,
    publicPath: publicJournalEntryPath(entry.public_slug),
    locationVisibility,
    ...(coarseRegionCode ? { coarseRegionCode } : {}),
    noindex: entry.public_noindex,
    entryDate: normalizeCalendarDate(entry.entry_date),
    entryScope: entry.entry_scope,
    createdAt: normalizeTimestamp(entry.created_at),
    kind: "journal_entry",
    coverSource,
    ...(coverPublicUrl ? { coverPublicUrl } : {}),
    ...quality,
  };
}

function isPublicEntryScope(value: string): value is "object" | "space" {
  return value === "object" || value === "space";
}

function isPublicLocationVisibility(
  value: string,
): value is "region" | "hidden" {
  return value === "region" || value === "hidden";
}

function normalizeCoverSource(
  value: JournalSearchCoverSource | null | undefined,
): JournalSearchCoverSource {
  if (
    value === "automatic_inline" ||
    value === "explicit_inline" ||
    value === "separate" ||
    value === "none"
  ) {
    return value;
  }
  return "none";
}

function normalizeCoverPublicUrl(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://") && !trimmed.startsWith("http://")) {
    return null;
  }
  if (/[?#]/.test(trimmed)) return null;
  if (/quarantine\//i.test(trimmed)) return null;
  return trimmed;
}

function normalizeCalendarDate(value: Date | string) {
  const match =
    typeof value === "string"
      ? /^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:$|T)/.exec(value.trim())
      : null;
  const parts: [number, number, number] | null =
    value instanceof Date
      ? [value.getFullYear(), value.getMonth() + 1, value.getDate()]
      : match
        ? [Number(match[1]), Number(match[2]), Number(match[3])]
        : null;
  if (!parts || parts.some((part) => !Number.isSafeInteger(part))) {
    return typeof value === "string" ? value : value.toISOString();
  }
  const [year, month, day] = parts;
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() + 1 !== month ||
    calendarDate.getUTCDate() !== day
  ) {
    return typeof value === "string" ? value : value.toISOString();
  }
  return calendarDate.toISOString();
}

function normalizeTimestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}
