export function publicJournalEntryPath(publicSlug: string): string {
  return `/journal/${encodeURIComponent(publicSlug)}`;
}

export function publicVarietyPath(publicSlug: string): string {
  return `/variety/${encodeURIComponent(publicSlug)}`;
}

export function createCatalogPublicSlug(
  canonicalName: string,
  catalogItemId: string,
  maxLength = 96,
): string {
  const suffix = catalogItemId.replaceAll("-", "").slice(-10);
  const baseLength = Math.max(1, maxLength - suffix.length - 1);
  const base = canonicalName
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, baseLength)
    .replace(/-+$/g, "");

  return `${base || "variety"}-${suffix}`;
}
