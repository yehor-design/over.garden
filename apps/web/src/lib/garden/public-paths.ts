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

/**
 * Where a journal entry lives: under its author (ADR-0029 D9).
 *
 * `/journal/{slug}` was a flat, global namespace, so "мій перший помідор"
 * collided across gardeners and *forced* a disambiguator into every URL — which
 * is why every published entry carried twelve hexadecimal characters of its
 * publish id. Scoping to the handle makes a collision per-person and rare, and
 * puts the first-hand claim where a reader and an answer engine both see it.
 *
 * One address, no locale prefix: an entry is never translated (D10).
 */
export function publicJournalEntryPath(
  authorHandle: string,
  publicSlug: string,
): string {
  return `${publicProfileBasePath(authorHandle)}/${encodeURIComponent(publicSlug)}`;
}

/**
 * The entry's previous address, kept for the 308 and for the places that hold
 * a slug without its author — a stored engagement ref, an old bookmark, a
 * link somebody published. It resolves through the slug history forever (D8).
 */
export function legacyPublicJournalEntryPath(publicSlug: string): string {
  return `/journal/${encodeURIComponent(publicSlug)}`;
}

/** An object passport, under the same author (ADR-0029 D9). */
export function publicObjectPassportPath(
  authorHandle: string,
  publicSlug: string,
): string {
  return `${publicProfileBasePath(authorHandle)}/${PUBLIC_OBJECT_PASSPORT_SEGMENT}/${encodeURIComponent(publicSlug)}`;
}

/**
 * The segment that separates a passport from an entry under one author, and
 * the reason `objects` is a reserved entry slug in the manifest: an entry
 * called *objects* would take its own author's passports with it.
 */
export const PUBLIC_OBJECT_PASSPORT_SEGMENT = "objects";

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

/**
 * The passport's previous address, kept for the 308 and for nothing else.
 *
 * It put a database identifier in a public URL: `/lineage/objects/{uuid}` told
 * a reader nothing, could not be typed, and could not be remembered.
 */
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
