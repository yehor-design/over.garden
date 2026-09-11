import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import type { CatalogKind } from "@/db/schema";

/**
 * The stand-in segment a lifecycle document shows when the request carried no
 * location of its own — a 404 or a 410 page rendered outside a request.
 *
 * It is a real slug in every namespace, so the builders encode it the way they
 * encode anything else and the rendered path is the shape a reader would
 * actually have typed.
 */
export const MISSING_ADDRESS_SLUG = "missing";

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

export function publicCommunityPath(slug: string): string {
  return `/communities/${encodeURIComponent(slug)}`;
}

/** One contribution's discussion, under the community that hosts it. */
export function publicCommunityDiscussionPath(
  slug: string,
  contributionId: string,
): string {
  return `${publicCommunityPath(slug)}/discussions/${encodeURIComponent(contributionId)}`;
}

/**
 * The legacy flat address a catalog request arrived at, rebuilt as asked for.
 *
 * This is the one builder that answers with the shape of the *request* rather
 * than the shape of the canonical, because it is what the 308 compares
 * against.
 */
export function requestedPublicCatalogPath(
  request:
    | { kind: "species"; speciesSlug: string; formSlug?: string | null }
    | { kind: "legacy"; catalogKind: CatalogKind; slug: string },
): string {
  if (request.kind === "species") {
    return publicCatalogEvidencePath(
      request.formSlug
        ? {
            catalogKind: "plant_variety",
            publicSlug: request.formSlug,
            speciesSlug: request.speciesSlug,
          }
        : { catalogKind: "species", publicSlug: request.speciesSlug },
    );
  }
  return publicCatalogEvidencePath({
    catalogKind: request.catalogKind,
    publicSlug: request.slug,
    speciesSlug: null,
  });
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
