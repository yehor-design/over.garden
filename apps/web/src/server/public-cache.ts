import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { PUBLIC_CACHE_TAGS, publicCacheTag } from "@/lib/public-cache-tags";
import type {
  CatalogBrowseInitial,
  CatalogBrowseKingdom,
} from "@/lib/public-catalog-browse";
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
import { getPublicObjectPassportPage } from "@/server/public-object-passport-repository";
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
import {
  getPublicVarietyPage,
  getPublicVarietyPageByCatalogItemId,
} from "@/server/public-variety-repository";

/**
 * The cached public reads (ADR-0022, D4). Every function here is a
 * `use cache` scope: its arguments are the cache key, it tags itself with the
 * tags the mutations name, and `cacheLife` bounds how long a stale entry may
 * live when no mutation names it. Pages call these instead of the repositories
 * for every read a guest could see; viewer-specific reads stay uncached.
 */

export async function readPublicJournalEntry(
  publicSlug: string,
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("hours");
  const lookup = await getPublicJournalEntryLookup(
    publicSlug,
    undefined,
    locale,
  );
  cacheTag(PUBLIC_CACHE_TAGS.journals, publicCacheTag.entrySlug(publicSlug));
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
export async function readCatalogRegisterHub(speciesSlug: string) {
  "use cache";
  cacheLife("days");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const { getCatalogRegisterHub } = await import(
    "@/server/public-catalog-register-repository"
  );
  return getCatalogRegisterHub(speciesSlug);
}

export async function readCatalogRegisterHubSpecies() {
  "use cache";
  cacheLife("days");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const { listCatalogRegisterHubSpecies } = await import(
    "@/server/public-catalog-register-repository"
  );
  return listCatalogRegisterHubSpecies();
}

export async function readCatalogBrowseKingdoms() {
  "use cache";
  cacheLife("days");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const { listCatalogBrowseKingdoms } = await import(
    "@/server/public-catalog-browse-repository"
  );
  return listCatalogBrowseKingdoms();
}

export async function readCatalogBrowsePage(
  kingdom: CatalogBrowseKingdom,
  initial: CatalogBrowseInitial | null,
  page: number,
) {
  "use cache";
  cacheLife("days");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const { listCatalogBrowsePage } = await import(
    "@/server/public-catalog-browse-repository"
  );
  return listCatalogBrowsePage({ kingdom, initial, page });
}

export async function readCatalogBrowseFirstHandOrganisms() {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const { listCatalogBrowseFirstHandOrganisms } = await import(
    "@/server/public-catalog-browse-repository"
  );
  return listCatalogBrowseFirstHandOrganisms();
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

export async function readPublicProfileEvidencePage(
  handle: string,
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.profiles, publicCacheTag.profile(handle));
  return getPublicProfileEvidencePageByHandle(handle, locale);
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
) {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_CACHE_TAGS.knowledge, PUBLIC_CACHE_TAGS.journals);
  return listPublicKnowledgeEvidence(rule, locale);
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

export async function readPublicObjectCatalogPage(
  request: PublicObjectCatalogRequest,
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("minutes");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  return listPublicObjectCatalogPage(request, locale);
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

export async function readPublicVarietyPage(
  publicSlug: string,
  expectedCatalogKind: Parameters<typeof getPublicVarietyPage>[1],
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.catalog);
  const page = await getPublicVarietyPage(
    publicSlug,
    expectedCatalogKind,
    undefined,
    locale,
  );
  if (page) cacheTag(publicCacheTag.organism(page.catalog.catalogItemId));
  return page;
}

/** One organism's card by its permanent identity (ADR-0026 D8, D9). */
export async function readPublicVarietyPageByCatalogItemId(
  catalogItemId: string,
  locale: PublicLocale,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(PUBLIC_CACHE_TAGS.catalog, publicCacheTag.organism(catalogItemId));
  return getPublicVarietyPageByCatalogItemId(catalogItemId, undefined, locale);
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
