/**
 * Cache tags of the public surfaces (ADR-0022, D4). A cached read tags itself
 * with every tag a mutation could name; a mutation revalidates the tags of
 * what it changed. Broad family tags (`feed`, `journals`, ...) keep the
 * mutation side simple: a new entry touches every listing that could show it.
 */
export const PUBLIC_CACHE_TAGS = {
  feed: "feed",
  journals: "journals",
  topics: "topics",
  communities: "communities",
  catalog: "catalog",
  knowledge: "knowledge",
  profiles: "profiles",
  sitemap: "sitemap",
} as const;

export const publicCacheTag = {
  entry: (entryId: string) => `entry:${entryId}`,
  entrySlug: (publicSlug: string) => `entry-slug:${publicSlug}`,
  profile: (handle: string) => `profile:${normalizeHandle(handle)}`,
  profileOwner: (ownerUserId: string) => `profile-owner:${ownerUserId}`,
  topic: (slug: string) => `topic:${slug}`,
  community: (slug: string) => `community:${slug}`,
  object: (plantObjectId: string) => `object:${plantObjectId}`,
  engagement: (kind: string, ref: string) => `engagement:${kind}:${ref}`,
} as const;

/** The tags an entry change touches: its page, every listing, the sitemap. */
export function publicEntryChangeTags(input: {
  entryId: string;
  publicSlug?: string | null;
  ownerUserId?: string | null;
  plantObjectId?: string | null;
}): string[] {
  return unique([
    publicCacheTag.entry(input.entryId),
    ...(input.publicSlug ? [publicCacheTag.entrySlug(input.publicSlug)] : []),
    ...(input.ownerUserId
      ? [publicCacheTag.profileOwner(input.ownerUserId)]
      : []),
    ...(input.plantObjectId
      ? [publicCacheTag.object(input.plantObjectId), PUBLIC_CACHE_TAGS.catalog]
      : []),
    PUBLIC_CACHE_TAGS.feed,
    PUBLIC_CACHE_TAGS.journals,
    PUBLIC_CACHE_TAGS.topics,
    PUBLIC_CACHE_TAGS.knowledge,
    PUBLIC_CACHE_TAGS.communities,
    PUBLIC_CACHE_TAGS.profiles,
    PUBLIC_CACHE_TAGS.sitemap,
  ]);
}

/** The tags a profile change touches: its page(s) and the listings naming it. */
export function publicProfileChangeTags(input: {
  ownerUserId: string;
  handle?: string | null;
  previousHandle?: string | null;
}): string[] {
  return unique([
    publicCacheTag.profileOwner(input.ownerUserId),
    ...(input.handle ? [publicCacheTag.profile(input.handle)] : []),
    ...(input.previousHandle
      ? [publicCacheTag.profile(input.previousHandle)]
      : []),
    PUBLIC_CACHE_TAGS.profiles,
    PUBLIC_CACHE_TAGS.feed,
    PUBLIC_CACHE_TAGS.journals,
    PUBLIC_CACHE_TAGS.communities,
    PUBLIC_CACHE_TAGS.sitemap,
  ]);
}

export function publicCommunityChangeTags(slug: string): string[] {
  return [publicCacheTag.community(slug), PUBLIC_CACHE_TAGS.communities];
}

export function publicEngagementChangeTags(kind: string, ref: string) {
  return [publicCacheTag.engagement(kind, ref)];
}

/** Every public tag: account erasure and moderation reach for this. */
export function allPublicCacheFamilyTags(): string[] {
  return Object.values(PUBLIC_CACHE_TAGS);
}

function normalizeHandle(handle: string) {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}
