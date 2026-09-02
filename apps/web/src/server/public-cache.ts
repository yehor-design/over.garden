import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { PUBLIC_CACHE_TAGS, publicCacheTag } from "@/lib/public-cache-tags";
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
import { getPublicVarietyPage } from "@/server/public-variety-repository";

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
  return getPublicVarietyPage(
    publicSlug,
    expectedCatalogKind,
    undefined,
    locale,
  );
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
