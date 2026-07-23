export const OBJECT_PROGRESS_MOMENT_MIN_ENTRIES = 2;

export interface ObjectProgressTimelineEntry {
  id: string;
  title: string;
  body: string;
  entryDate: Date | string;
  mediaPublicUrl: string | null;
  mediaFocalX?: number | null;
  mediaFocalY?: number | null;
  mediaIntrinsicWidth?: number | null;
  mediaIntrinsicHeight?: number | null;
}

export function isObjectProgressMomentEligible(entryCount: number) {
  return entryCount >= OBJECT_PROGRESS_MOMENT_MIN_ENTRIES;
}

export function buildObjectProgressTimeline<
  T extends ObjectProgressTimelineEntry,
>(entries: readonly T[]): T[] {
  return [...entries].sort(compareEntriesChronologically);
}

export function formatEntryBodyExcerpt(body: string, maxLength = 120) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function pickProgressPhotoComparison<
  T extends ObjectProgressTimelineEntry,
>(entries: readonly T[]): { earlier: T; latest: T } | null {
  const sorted = buildObjectProgressTimeline(entries);
  if (sorted.length < OBJECT_PROGRESS_MOMENT_MIN_ENTRIES) return null;

  const earliestWithPhoto = sorted.find((entry) => entry.mediaPublicUrl);
  const latestWithPhoto = [...sorted]
    .reverse()
    .find((entry) => entry.mediaPublicUrl);

  if (
    earliestWithPhoto &&
    latestWithPhoto &&
    earliestWithPhoto.id !== latestWithPhoto.id
  ) {
    return { earlier: earliestWithPhoto, latest: latestWithPhoto };
  }

  return null;
}

function compareEntriesChronologically(
  left: ObjectProgressTimelineEntry,
  right: ObjectProgressTimelineEntry,
) {
  const leftTime = toEntryTimestamp(left.entryDate);
  const rightTime = toEntryTimestamp(right.entryDate);
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.id.localeCompare(right.id);
}

function toEntryTimestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}
