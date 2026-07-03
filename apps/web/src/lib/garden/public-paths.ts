export function publicJournalEntryPath(publicSlug: string): string {
  return `/journal/${encodeURIComponent(publicSlug)}`;
}

export function publicVarietyPath(publicSlug: string): string {
  return `/variety/${encodeURIComponent(publicSlug)}`;
}

export function gardenFirstEntryHomepagePath(): string {
  return "/garden?source=homepage";
}

export function gardenFirstEntryInvitePath(): string {
  return "/garden?source=invited-cohort";
}

export function pilotInviteJoinPath(token: string): string {
  const params = new URLSearchParams({ invite: token });
  return `/join?${params.toString()}`;
}

export function pilotInviteJoinUrl(token: string, baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return `${normalizedBase}${pilotInviteJoinPath(token)}`;
}

export function lineageInvitationClaimPath(token: string): string {
  const params = new URLSearchParams({ token });
  return `/garden/lineage/invitations/claim?${params.toString()}`;
}

export function gardenFirstEntryPreselectionPath(publicSlug: string): string {
  const params = new URLSearchParams({
    catalog: publicSlug,
    source: "public-variety",
  });

  return `/garden?${params.toString()}`;
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
