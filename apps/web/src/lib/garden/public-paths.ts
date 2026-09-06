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

/**
 * Where an organism lives (ADR-0026 D8). A species answers at
 * `/species/{slug}`; a cultivar or breed at `/species/{species}/{form}` once
 * it is a form of a species with an address, and at its legacy `/variety/*`
 * or `/breed/*` path until then. This is the one place a catalog path is
 * spelled: every surface, sitemap and picker row passes through it.
 */
export interface PublicCatalogAddress {
  catalogKind: CatalogKind;
  publicSlug: string;
  /** The current slug of the species the form belongs to, when known. */
  speciesSlug?: string | null;
}

export function publicCatalogEvidencePath(address: PublicCatalogAddress): string {
  const slug = encodeURIComponent(address.publicSlug);
  if (address.catalogKind === "species") return `/species/${slug}`;
  if (address.speciesSlug) {
    return `/species/${encodeURIComponent(address.speciesSlug)}/${slug}`;
  }
  return `/${address.catalogKind === "breed" ? "breed" : "variety"}/${slug}`;
}

/** A plant variety by its legacy or hierarchical address. */
export function publicVarietyPath(
  publicSlug: string,
  speciesSlug: string | null = null,
): string {
  return publicCatalogEvidencePath({
    catalogKind: "plant_variety",
    publicSlug,
    speciesSlug,
  });
}

export function gardenFirstEntryHomepagePath(): string {
  return "/garden?source=homepage";
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
