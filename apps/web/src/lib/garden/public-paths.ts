import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import type { CatalogKind } from "@/db/schema";

export function publicJournalEntryPath(publicSlug: string): string {
  return `/journal/${encodeURIComponent(publicSlug)}`;
}

/**
 * Interactive public journal evidence must preserve the already-resolved
 * interface locale. Keep the canonical base path above locale-neutral for
 * metadata and search documents.
 */
export function localizedPublicJournalEvidencePath(
  locale: PublicLocale,
  publicSlug: string,
): string {
  return localizedPath(locale, publicJournalEntryPath(publicSlug));
}

export function publicVarietyPath(publicSlug: string): string {
  return publicCatalogEvidencePath("plant_variety", publicSlug);
}

export function publicCatalogEvidencePath(
  catalogKind: CatalogKind,
  publicSlug: string,
): string {
  const routeSegment: Record<CatalogKind, string> = {
    plant_variety: "variety",
    species: "species",
    breed: "breed",
  };

  return `/${routeSegment[catalogKind]}/${encodeURIComponent(publicSlug)}`;
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
  return `/garden/lineage/invitations/claim#${params.toString()}`;
}

export function publicLineageObjectPath(plantObjectId: string): string {
  return `/lineage/objects/${encodeURIComponent(plantObjectId)}`;
}

export function publicTopicPath(slug: string): string {
  return `/topics/${encodeURIComponent(slug)}`;
}

export function publicProfilePath(
  locale: PublicLocale,
  handle: string,
): string {
  return localizedPath(locale, publicProfileBasePath(handle));
}

export function publicProfileBasePath(handle: string): string {
  const normalizedHandle = handle.replace(/^@/, "");
  return `/@${encodeURIComponent(normalizedHandle)}`;
}

export function gardenFirstEntryPreselectionPath(publicSlug: string): string {
  const params = new URLSearchParams({
    catalog: publicSlug,
    source: "public-variety",
  });

  return `/garden?${params.toString()}`;
}

export function gardenCatalogPreselectionPath(publicSlug: string): string {
  const params = new URLSearchParams({
    catalog: publicSlug,
    source: "public-catalog",
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
