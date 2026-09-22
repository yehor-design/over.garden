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
 * The stand-in number beside `MISSING_ADDRESS_SLUG`, for the same case. Zero
 * is deliberately not an entry number — the count starts at 1 — so the path a
 * not-found document shows can never be mistaken for an entry that exists.
 */
export const MISSING_ENTRY_NUMBER = 0;

/**
 * The segment between an author and an entry's number, and the reason `post`
 * is a reserved entry name in the manifest beside `objects`.
 */
export const PUBLIC_JOURNAL_ENTRY_SEGMENT = "post";

/**
 * Where a journal entry lives: under its author, at its number (ADR-0029 D9,
 * amendment of 2026-09-18) — `/@yehor/post/12`.
 *
 * The number is the author's own count of publishes. It is assigned at
 * publish, never changes and is never reused, so this is the one address an
 * entry will ever have; there is nothing in it a later decision could want to
 * rename.
 *
 * What it replaced was `/@{handle}/{slug}`, the name made from the title in
 * the gardener's own alphabet. A browser hands the clipboard the
 * percent-encoded form of that, six characters for every Cyrillic letter, and
 * the address bar is how a link travels here: one entry arrived as 181
 * characters of `%D0%BA%D1%80…`. Before that it was `/journal/{slug}`, a flat
 * global namespace that forced twelve hexadecimal characters of the publish id
 * into every URL. Both still answer, with one 308 each.
 *
 * The parameter is a `number` on purpose. Every caller used to pass the slug,
 * and a `string` parameter would have gone on accepting it.
 *
 * One address, no locale prefix: an entry is never translated (D10).
 */
export function publicJournalEntryPath(
  authorHandle: string,
  entryNumber: number,
): string {
  return `${publicProfileBasePath(authorHandle)}/${PUBLIC_JOURNAL_ENTRY_SEGMENT}/${entryNumber}`;
}

/**
 * The address to link an entry at, from whatever a listing row knows.
 *
 * The numbered address when the row carries the author's handle and the
 * entry's number, which is every published entry of a gardener who has a
 * handle. The flat legacy path stays for the one case where it is the address
 * that answers: an author with no handle has no `/@…` to live under. A link
 * into a redirect costs every reader a hop and tells a crawler the page lives
 * somewhere else, so nothing links the legacy path when the canonical one can
 * be built — the same rule `publicObjectPassportAddress` keeps for passports.
 */
export function publicJournalEntryAddress(input: {
  authorHandle: string | null | undefined;
  entryNumber: number | null | undefined;
  publicSlug: string | null | undefined;
}): string {
  return input.authorHandle && input.entryNumber
    ? publicJournalEntryPath(input.authorHandle, input.entryNumber)
    : legacyPublicJournalEntryPath(input.publicSlug ?? "");
}

/**
 * The entry's address between 2026-09-12 and 2026-09-18, kept for the 308.
 * Nothing links here: it exists so that the proxy, the proofs and the tests
 * spell the old address the way it was spelled.
 */
export function legacyAuthorScopedJournalEntryPath(
  authorHandle: string,
  publicSlug: string,
): string {
  return `${publicProfileBasePath(authorHandle)}/${encodeURIComponent(publicSlug)}`;
}

/**
 * The entry's first address, kept for the 308 and for the places that hold
 * a slug without its author — an old bookmark, a link somebody published. It
 * resolves through the slug history forever (D8).
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

export function publicCatalogEvidencePath(
  address: PublicCatalogAddress,
): string {
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

/**
 * The address to link a passport at, from whatever a listing row knows.
 *
 * Every public surface that names an object — the entry it is the subject of,
 * the journal directory, a profile, the feed, the object catalog, a community
 * page — used to link `/lineage/objects/{uuid}`, which has answered 308 since
 * OVE-428 moved passports under their authors. A link into a redirect costs
 * every reader a hop and tells a crawler the page lives somewhere else. The
 * canonical is built here when the row carries the handle and the slug; the
 * legacy path stays only for an object that has no slug yet, where it is the
 * one address that answers.
 */
export function publicObjectPassportAddress(input: {
  authorHandle: string | null | undefined;
  publicSlug: string | null | undefined;
  plantObjectId: string;
}): string {
  return input.authorHandle && input.publicSlug
    ? publicObjectPassportPath(input.authorHandle, input.publicSlug)
    : publicLineageObjectPath(input.plantObjectId);
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

/**
 * Adding the organism a card describes to the gardener's garden (`OVE-485`).
 * It goes through object setup, which first offers the gardener's own objects
 * of that organism, so writing about the tomato they have never starts a
 * second one.
 */
export function gardenObjectSetupPreselectionPath(publicSlug: string): string {
  const params = new URLSearchParams({ catalog: publicSlug });
  return `/garden/objects/new?${params.toString()}`;
}
