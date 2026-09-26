import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { PUBLIC_CACHE_TAGS, publicCacheTag } from "@/lib/public-cache-tags";
import type { PublicCatalogBrowseRequest } from "@/lib/public-catalog-browse";
import type { PublicLocale } from "@/lib/public-localization";
import {
  getPublicCommunityPage,
  hasReadyCommunityNavigation,
  listPublicCommunities,
  type CommunityObjectKind,
} from "@/server/community-repository";
import {
  getEngagementSummary,
  type EngagementTarget,
} from "@/server/engagement-repository";
import { getPublicJournalEntryLookup } from "@/server/journal-repository";
import {
  listPublicFeedPage,
  listTrustedPublicFeedTopics,
  type PublicFeedRequest,
} from "@/server/public-feed-repository";
import {
  listPublicJournalDirectoryFacets,
  listPublicJournalDirectoryPage,
} from "@/server/public-journal-directory-repository";
import { listPublicKnowledgeEvidence } from "@/server/public-knowledge-evidence-repository";
import {
  listPublicObjectCatalogPage,
  type PublicObjectCatalogRequest,
} from "@/server/public-object-catalog-repository";
import {
  getPublicObjectPassportIdBySlug,
  getPublicObjectPassportPage,
} from "@/server/public-object-passport-repository";
import { getPublicLineageGraphPage } from "@/server/public-lineage-repository";
import { getPublicProfileEvidencePageByHandle } from "@/server/public-profile-repository";
import {
  buildPublicSitemapChunk,
  listPublicSitemapChunkIds,
  type PublicSitemapChunkId,
} from "@/server/public-sitemap";
import {
  getPublicTopicAggregationPage,
  listPublicKnowledgeTopics,
} from "@/server/public-topic-repository";
import type { PublicCatalogAddressRequest } from "@/lib/catalog/addresses";
import { resolvePublicCatalogAddress } from "@/server/public-catalog-address-repository";
import { getSpeciesPage, listSpeciesEntries } from "@/server/species-page";

/**
 * The cached public reads (ADR-0022, D4). Every function here is a
 * `use cache` scope: its arguments are the cache key, it tags itself with the
 * tags the mutations name, and `cacheLife` bounds how long a stale entry may
 * live when no mutation names it. Pages call these instead of the repositories
 * for every read a guest could see; viewer-specific reads stay uncached.
 */

export async function readPublicJournalEntry(
  /** The author's handle and the entry's number: the address is the key. */
  authorHandle: string,
  entryNumber: number,
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("hours");
  const lookup = await getPublicJournalEntryLookup(
    authorHandle,
    entryNumber,
    undefined,
    locale,
  );
  // `journals` is what a publish revalidates, and it is what lets a cached
  // "not found" for the author's *next* number expire the moment that number
  // is published. The author's tag covers a handle change, which moves every
  // address under it.
  cacheTag(PUBLIC_CACHE_TAGS.journals, publicCacheTag.profile(authorHandle));
  if (lookup.status === "active") {
    const { page } = lookup;
    cacheTag(publicCacheTag.entry(page.entry.id));
    if (page.author) cacheTag(publicCacheTag.profile(page.author.handle));
    if (page.context?.kind === "object") {
      cacheTag(publicCacheTag.object(page.context.object.plantObjectId));
    }
  }
  return lookup;
}

/**
 * The catalog's browse counts and pages (OVE-431).
 *
 * `days`, not `hours`: the catalog changes when an import runs, not when a
 * gardener writes, and this is the one read on the crawl path that touches a
 * hundred thousand rows. `catalogCard` tags keep a card's own page fresh; the
 * browse index is allowed to lag a new import by a day rather than pay for a
 * grouped scan per crawler request.
 */
/**
 * A species' register hub (OVE-433).
 *
 * `days`, like the browse: the registers change when an import runs, and the
 * hub is a crawl target rather than a page a gardener refreshes.
 */
export async function readCatalogRegisterHub(
  speciesSlug: string,
  view: { query: string; page: number; locale: PublicLocale },
) {
  "use cache";
  cacheLife("days");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const { getCatalogRegisterHub } =
    await import("@/server/public-catalog-register-repository");
  return getCatalogRegisterHub(speciesSlug, view);
}

export async function readCatalogRegisterHubSpecies() {
  "use cache";
  cacheLife("days");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const { listCatalogRegisterHubSpecies } =
    await import("@/server/public-catalog-register-repository");
  return listCatalogRegisterHubSpecies();
}

export async function readCatalogBrowseKingdoms() {
  "use cache";
  cacheLife("days");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const { listCatalogBrowseKingdoms } =
    await import("@/server/public-catalog-browse-repository");
  return listCatalogBrowseKingdoms();
}

/**
 * One page of the catalogue, under whatever the reader asked for.
 *
 * The whole request is the cache key, which is what a merged listing needs:
 * the root, a kingdom, a letter, a register and a search are all this read,
 * and each view caches on its own. `days`, because the catalogue changes when
 * an import runs and not when a gardener refreshes.
 */
export async function readCatalogBrowsePage(
  request: PublicCatalogBrowseRequest,
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("days");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const { listCatalogBrowsePage } =
    await import("@/server/public-catalog-browse-repository");
  return listCatalogBrowsePage(request, locale);
}

/**
 * The organisms gardeners here have written about, for the catalogue's door
 * (`OVE-496`): the catalogue's own `grown=1` view, cut short. `catalog` is
 * revalidated whenever an entry about an object changes
 * (`publicEntryChangeTags`), so a newly written-about organism does not wait
 * out the day.
 */
export async function readCatalogFirstHandOrganisms(locale: PublicLocale) {
  "use cache";
  cacheLife("days");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const { listCatalogBrowseFirstHandOrganisms } =
    await import("@/server/public-catalog-browse-repository");
  return listCatalogBrowseFirstHandOrganisms(locale, 12);
}

/** The counts beside every facet option, for the same request. */
export async function readCatalogBrowseFacets(
  request: PublicCatalogBrowseRequest,
) {
  "use cache";
  cacheLife("days");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const { countCatalogBrowseFacets } =
    await import("@/server/public-catalog-browse-repository");
  return countCatalogBrowseFacets(request);
}

export async function readPublicFeedPage(
  request: PublicFeedRequest,
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_CACHE_TAGS.feed);
  return listPublicFeedPage(request, locale);
}

export async function readTrustedPublicFeedTopics(locale: PublicLocale) {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_CACHE_TAGS.feed, PUBLIC_CACHE_TAGS.topics);
  return listTrustedPublicFeedTopics(undefined, 6, locale);
}

export async function readPublicJournalDirectoryPage(
  request: Parameters<typeof listPublicJournalDirectoryPage>[0],
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_CACHE_TAGS.journals);
  return listPublicJournalDirectoryPage(request, locale);
}

export async function readPublicJournalDirectoryFacets() {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_CACHE_TAGS.journals);
  return listPublicJournalDirectoryFacets();
}

/**
 * A profile with one page of each of its lists (`OVE-494`). The pages are
 * plain numbers so each view is its own cache entry; the static document is
 * `1, 1`.
 */
export async function readPublicProfileEvidencePage(
  handle: string,
  locale: PublicLocale,
  entriesPage = 1,
  objectsPage = 1,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.profiles, publicCacheTag.profile(handle));
  return getPublicProfileEvidencePageByHandle(handle, locale, {
    entriesPage,
    objectsPage,
  });
}

export async function readPublicTopicPage(slug: string, locale: PublicLocale) {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.topics, publicCacheTag.topic(slug));
  return getPublicTopicAggregationPage(slug, { locale });
}

export async function readPublicKnowledgeTopics() {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_CACHE_TAGS.topics, PUBLIC_CACHE_TAGS.knowledge);
  return listPublicKnowledgeTopics();
}

export async function readPublicKnowledgeEvidence(
  rule: Parameters<typeof listPublicKnowledgeEvidence>[0],
  locale: PublicLocale,
  visibleLimit?: number,
) {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_CACHE_TAGS.knowledge, PUBLIC_CACHE_TAGS.journals);
  return listPublicKnowledgeEvidence(rule, locale, { visibleLimit });
}

export async function readPublicCommunityDirectory() {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_CACHE_TAGS.communities);
  return listPublicCommunities(null);
}

/** The guest view of a community; a signed-in viewer reads the repository. */
export async function readPublicCommunityPage(
  slug: string,
  locale: PublicLocale,
  query: string,
  kind: CommunityObjectKind | undefined,
  cursor: string | null,
) {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_CACHE_TAGS.communities, publicCacheTag.community(slug));
  return getPublicCommunityPage(slug, locale, {
    viewerScope: null,
    query,
    kind,
    cursor,
  });
}

export async function readCommunityNavigationReadiness() {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_CACHE_TAGS.communities);
  return hasReadyCommunityNavigation();
}

/**
 * The EPPO archive's first page, unfiltered: the static document's read
 * (ADR-0032). The capture itself is immutable (ADR-0025 D2), so the only thing
 * that changes here is which canonical cards the records point at.
 */
export async function readPublicEppoSourcePage(locale: PublicLocale) {
  "use cache";
  cacheLife("days");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const { listPublicEppoSourcePage, parseEppoArchiveRequest } =
    await import("@/server/catalog-source/public-eppo-explorer-repository");
  return listPublicEppoSourcePage(parseEppoArchiveRequest({}).request, locale);
}

export async function readPublicObjectCatalogPage(
  request: PublicObjectCatalogRequest,
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  return listPublicObjectCatalogPage(request, locale);
}

/** Address changes and newly published objects invalidate this resolver. */
export async function readPublicObjectPassportIdBySlug(
  handle: string,
  slug: string,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.catalog, publicCacheTag.profile(handle));
  const id = await getPublicObjectPassportIdBySlug(handle, slug);
  if (id) cacheTag(publicCacheTag.object(id));
  return id;
}

export async function readPublicLineageGraphPage(objectId: string) {
  "use cache";
  cacheLife("hours");
  // A confirmed edge can change the graph viewed from either end and every
  // ancestor. Claim mutations expire the family, not only the subject page.
  cacheTag(PUBLIC_CACHE_TAGS.catalog, publicCacheTag.object(objectId));
  return getPublicLineageGraphPage(objectId);
}

export async function readPublicObjectPassportPage(
  plantObjectId: string,
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.catalog, publicCacheTag.object(plantObjectId));
  return getPublicObjectPassportPage(plantObjectId, undefined, locale);
}

/**
 * A species page by its permanent identity (`OVE-519`): its names, whether it
 * is published, and the first portion of «Записи».
 *
 * `catalog` is what every entry change revalidates when the entry is about an
 * object (`publicEntryChangeTags`), and a gardener's rename too
 * (`publicProfileChangeTags`), so publishing, unpublishing, deleting or
 * erasing an entry reaches this page, its species' page and its forms' pages
 * at once — none of them knows which of the others an entry is on. The
 * organism's own tag is what a merge or a slug change drops.
 */
export async function readSpeciesPage(
  catalogItemId: string,
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.catalog, publicCacheTag.organism(catalogItemId));
  return getSpeciesPage(catalogItemId, locale);
}

/** A later portion of a species page's «Записи», under the same tags. */
export async function readSpeciesEntries(
  catalogItemId: string,
  cursor: string,
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.catalog, publicCacheTag.organism(catalogItemId));
  return listSpeciesEntries(catalogItemId, cursor, locale);
}

/**
 * Where an address request leads: the canonical page, a permanent redirect
 * to it, or nothing. Tagged with every organism address, and with the
 * organism it resolves to, so a slug assignment or a merge drops it.
 */
export async function readPublicCatalogAddress(
  request: PublicCatalogAddressRequest,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.organismSlugs);
  const lookup = await resolvePublicCatalogAddress(request);
  if (lookup.status !== "not_found") {
    cacheTag(publicCacheTag.organism(lookup.catalogItemId));
  }
  return lookup;
}

/** Likes and comment counts as a guest sees them. */
export async function readGuestEngagementSummary(
  target: EngagementTarget,
  commentCursor: string | null,
) {
  "use cache";
  cacheLife("minutes");
  cacheTag(publicCacheTag.engagement(target.kind, target.ref));
  return getEngagementSummary(target, null, { commentCursor });
}

export async function readPublicSitemapChunkIds() {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.sitemap);
  return listPublicSitemapChunkIds();
}

export async function readPublicSitemapChunk(id: PublicSitemapChunkId) {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.sitemap);
  return buildPublicSitemapChunk(id);
}
