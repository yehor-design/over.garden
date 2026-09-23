import "server-only";
import { publicMediaEligibilityPredicate } from "@/server/media/public-media-eligibility";
import {
  readMediaVariantExtras,
  type MediaVariantExtras,
} from "@/server/media/media-variant-schema";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  Database,
  PlantObjectKind,
  UserPublicProfile,
} from "@/db/schema";
import {
  publicJournalEntryAddress,
  publicObjectPassportAddress,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import {
  isCoarseRegionCode,
  normalizeCoarseRegionCode,
  type CoarseRegionCode,
} from "@/lib/garden/regions";
import {
  DEFAULT_PUBLIC_LOCALE,
  normalizePublicContentLanguage,
  type PublicLocale,
} from "@/lib/public-localization";
import type { PublicProjectionQualityClass } from "@/lib/public-projection-quality";
import { getPublicDerivativeUrl } from "@/lib/storage";
import {
  evaluatePublicIdentity,
  parsePublicHandleSyntax,
} from "@/server/identity-policy";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";
import type { RequestScope } from "@/server/request-scope";
import { catalogKindSql } from "@/server/catalog-kind-sql";
import {
  buildPublicFeedExcerpt,
  buildPublicFeedMediaQuery,
  buildPublicFeedTopicsForEntriesQuery,
  isPublicFeedExcerptTruncated,
  serializePublicFeedMedia,
  type PublicFeedCardEntry,
  type PublicFeedMediaRow,
  type PublicFeedTopicRow,
} from "@/server/public-feed-repository";
import { localizeTopicLabel } from "@/lib/system-topic-labels";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const MAX_PROFILE_LINKS = 5;
/**
 * A profile's two lists, a page at a time (`OVE-494`). Every entry and every
 * object is reachable from the profile by paging, where the profile used to
 * stop at sixteen entries and twelve objects with no way past them.
 */
export const PUBLIC_PROFILE_ENTRY_PAGE_SIZE = 10;
export const PUBLIC_PROFILE_OBJECT_PAGE_SIZE = 12;
/** The same ceiling the interface route policy puts on `?page=`. */
export const PUBLIC_PROFILE_MAX_PAGE = 1_000;

const PUBLIC_PROFILE_LANGUAGES = new Set<PublicProfileLanguage>([
  "uk",
  "bg",
  "ru",
  "en",
]);

export type PublicHandleValidationError = "format" | "unavailable";

export type PublicHandleUpdateStatus =
  | "updated"
  | "unchanged"
  | "cooldown"
  | PublicHandleValidationError;

export type PublicHandleValidationResult =
  | {
      ok: true;
      handle: string;
      normalizedHandle: string;
      mention: `@${string}`;
    }
  | {
      ok: false;
      error: PublicHandleValidationError;
    };

export interface PublicProfileSummary {
  publicEntryCount: number;
  publicObjectCount: number;
  confirmedLineageEdgeCount: number;
}

export interface PublicProfileLink {
  kind: "journal_entry";
  href: string;
  entryDate: Date | string;
}

export interface PublicProfilePage {
  handle: string;
  mention: `@${string}`;
  displayName: string | null;
  avatarUrl: string | null;
  summary: PublicProfileSummary;
  links: PublicProfileLink[];
}

export type PublicProfileLanguage = "uk" | "bg" | "ru" | "en";

export interface PublicProfileObjectEvidence {
  objectId: string;
  displayName: string;
  objectKind: PlantObjectKind;
  identityLabel: string | null;
  identityState: "confirmed" | "provisional" | "unknown";
  latestEntryDate: Date | string;
  publicEntryCount: number;
  publicPath: string;
  coverImageUrl: string | null;
  coverImageAlt: string;
  coverFocalX: number | null;
  coverFocalY: number | null;
  coverIntrinsicWidth: number | null;
  coverIntrinsicHeight: number | null;
  /** 16 px WebP data URI painted until the cover loads (OVE-371). */
  coverPlaceholderDataUri: string | null;
  /** Long edges of the cover's promoted variants; [] on pre-0047 rows. */
  coverVariantLongEdges: number[];
}

/**
 * One of the gardener's entries, in the shape the feed's card draws
 * (`OVE-494`): a profile shows the same card as the feed, not a card of its
 * own.
 */
export type PublicProfileEntry = PublicFeedCardEntry;

/** One page of one of a profile's lists. */
export interface PublicProfileListPage<Item> {
  items: Item[];
  /** 1-based, as asked for. A page past the end has no items. */
  page: number;
  /** At least 1, so an empty list still has the page it is on. */
  pageCount: number;
}

/** Which page of each list a view shows. */
export interface PublicProfileListRequest {
  entriesPage: number;
  objectsPage: number;
}

export const FIRST_PUBLIC_PROFILE_PAGES: PublicProfileListRequest = {
  entriesPage: 1,
  objectsPage: 1,
};

export interface PublicProfileEvidencePage {
  handle: string;
  mention: `@${string}`;
  displayName: string;
  avatarUrl: string | null;
  avatarAlt: string;
  bio: string | null;
  languages: PublicProfileLanguage[];
  coarseRegionCode: CoarseRegionCode | null;
  summary: {
    publicEntryCount: number;
    publicObjectCount: number;
    objectKinds: {
      plant: number;
      animal: number;
    };
    relationships: {
      followers: number;
      following: number;
    } | null;
  };
  entries: PublicProfileListPage<PublicProfileEntry>;
  objects: PublicProfileListPage<PublicProfileObjectEvidence>;
  qualityClass?: PublicProjectionQualityClass;
}

export interface PublicHandleMentionTarget {
  handle: string;
  mention: `@${string}`;
  profilePath: string;
}

export interface UpdateUserPublicHandleResult {
  status: PublicHandleUpdateStatus;
  profile: Pick<UserPublicProfile, "handle" | "display_name" | "avatar_url">;
  previousHandle: string;
  nextEligibleAt: Date | string | null;
}

interface PublicProfileInternalRow {
  userId: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarMediaAssetId: string | null;
  bio: string | null;
  languages: string[];
  locationVisibility: string;
  coarseRegionCode: string | null;
  relationshipVisibility: string;
}

interface PublicProfileEntrySummaryRow {
  publicEntryCount: string | number | bigint;
  publicObjectCount: string | number | bigint;
  publicPlantCount?: string | number | bigint;
  publicAnimalCount?: string | number | bigint;
}

interface PublicProfileLineageSummaryRow {
  confirmedLineageEdgeCount: string | number | bigint;
}

interface PublicProfileLinkRow {
  publicSlug: string | null;
  /** The `{n}` of the entry's address, `/@{handle}/post/{n}`. */
  entryNumber: number | null;
  entryDate: Date | string;
}

interface PublicProfileCountRow {
  count: string | number | bigint;
}

interface PublicProfileObjectRow {
  objectId: string;
  publicSlug: string | null;
  displayName: string;
  objectKind: string;
  catalogCanonicalName: string | null;
  catalogKind: string | null;
  varietyText: string | null;
  varietyState: string;
  latestEntryDate: Date | string;
  publicEntryCount: string | number | bigint;
}

interface PublicProfileEntryRow {
  entryId: string;
  publicSlug: string | null;
  /** The `{n}` of the entry's address, `/@{handle}/post/{n}`. */
  entryNumber: number | null;
  title: string;
  body: string;
  sourceLanguage: string | null;
  entryDate: Date | string;
  publishedAt: Date | string | null;
  entryScope: string;
  objectId: string | null;
  objectPublicSlug: string | null;
  objectDisplayName: string | null;
  objectKind: string | null;
  objectLocationVisibility: string | null;
  objectCoarseRegionCode: string | null;
  spaceDisplayName: string;
}

interface PublicProfileObjectMediaRow {
  objectId: string;
  entryId: string;
  mediaAssetId: string;
  derivativeKey: string | null;
  altText: string | null;
  focalX: number | null;
  focalY: number | null;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
}

interface PublicProfileLifecycleRow {
  handleLifecycleState: string;
  profileLifecycleState: string | null;
  removedAt: Date | string | null;
}

interface PublicHandleClaimRow {
  status: string;
  previousHandle: string | null;
  currentHandle: string | null;
  nextEligibleAt: Date | string | null;
}

export type PublicProfileLifecycleLookup =
  | { status: "active" }
  | { status: "gone" }
  | { status: "not_found" };

export async function ensureUserPublicProfile(
  scope: RequestScope,
  executor: QueryExecutor = db,
): Promise<UserPublicProfile> {
  try {
    await sql`select overgarden_provision_user_public_profile(${scope.userId}::uuid)`.execute(
      executor,
    );
  } catch {
    throw new Error("Public identity provisioning failed.");
  }

  const profile = await buildUserPublicProfileByUserIdQuery(
    executor,
    scope.userId,
  ).executeTakeFirst();
  if (!profile) {
    throw new Error("Public identity provisioning failed.");
  }

  return profile;
}

export async function updateUserPublicHandle(
  scope: RequestScope,
  rawHandle: string,
  executor: QueryExecutor = db,
): Promise<UpdateUserPublicHandleResult> {
  const validation = normalizePublicHandleInput(rawHandle);
  const currentProfile = await ensureUserPublicProfile(scope, executor);

  if (!validation.ok) {
    const currentClaim = await buildCurrentPublicHandleClaimQuery(
      executor,
      scope.userId,
    ).executeTakeFirst();
    return {
      status: validation.error,
      profile: currentProfile,
      previousHandle: currentProfile.handle,
      nextEligibleAt: currentClaim?.nextEligibleAt ?? null,
    };
  }

  let claim: PublicHandleClaimRow | undefined;
  try {
    const result = await sql<PublicHandleClaimRow>`
      select
        status,
        previous_handle as "previousHandle",
        current_handle as "currentHandle",
        next_eligible_at as "nextEligibleAt"
      from overgarden_claim_user_public_handle(
        ${scope.userId}::uuid,
        ${validation.normalizedHandle}
      )
    `.execute(executor);
    claim = result.rows[0];
  } catch {
    throw new Error("Public handle update failed.");
  }

  if (!claim || !isPublicHandleUpdateStatus(claim.status)) {
    throw new Error("Public handle update failed.");
  }

  const profile =
    (await buildUserPublicProfileByUserIdQuery(
      executor,
      scope.userId,
    ).executeTakeFirst()) ?? currentProfile;
  const authoritativeClaim =
    claim.nextEligibleAt === null
      ? await buildCurrentPublicHandleClaimQuery(
          executor,
          scope.userId,
        ).executeTakeFirst()
      : null;

  return {
    status: claim.status,
    profile,
    previousHandle: claim.previousHandle ?? currentProfile.handle,
    nextEligibleAt:
      claim.nextEligibleAt ?? authoritativeClaim?.nextEligibleAt ?? null,
  };
}

export function buildCurrentPublicHandleClaimQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
    .selectFrom("user_handle_registry")
    .select("next_rename_at as nextEligibleAt")
    .where("user_id", "=", userId)
    .where("lifecycle_state", "=", "current")
    .limit(1);
}

export async function getPublicProfilePageByHandle(
  rawHandle: string,
  executor: QueryExecutor = db,
): Promise<PublicProfilePage | null> {
  const parsed = parsePublicHandleSyntax(rawHandle);
  if (!parsed.ok) return null;

  const profile = await buildPublicProfileByNormalizedHandleQuery(
    executor,
    parsed.normalizedHandle,
  ).executeTakeFirst();

  if (!profile) return null;

  const [entrySummary, lineageSummary, links] = await Promise.all([
    buildPublicProfileEntrySummaryQuery(
      executor,
      profile.userId,
    ).executeTakeFirst(),
    buildPublicProfileLineageSummaryQuery(
      executor,
      profile.userId,
    ).executeTakeFirst(),
    buildPublicProfileLinksQuery(executor, profile.userId).execute(),
  ]);

  return serializePublicProfilePage({
    profile,
    entrySummary,
    lineageSummary,
    links,
  });
}

export async function getPublicProfileEvidencePageByHandle(
  rawHandle: string,
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
  request: PublicProfileListRequest = FIRST_PUBLIC_PROFILE_PAGES,
  executor: QueryExecutor = db,
): Promise<PublicProfileEvidencePage | null> {
  const parsed = parsePublicHandleSyntax(rawHandle);
  if (!parsed.ok) return null;

  const profile = await buildPublicProfileByNormalizedHandleQuery(
    executor,
    parsed.normalizedHandle,
  ).executeTakeFirst();

  if (!profile) return null;

  return loadPublicProfileEvidencePage(profile, locale, request, executor);
}

export async function getPublicProfileLifecycleLookup(
  rawHandle: string,
  viewerUserId: string | null = null,
  executor: QueryExecutor = db,
): Promise<PublicProfileLifecycleLookup> {
  const parsed = parsePublicHandleSyntax(rawHandle);
  if (!parsed.ok) return { status: "not_found" };

  const row = await buildPublicProfileLifecycleQuery(
    executor,
    parsed.normalizedHandle,
    viewerUserId,
  ).executeTakeFirst();

  return classifyPublicProfileLifecycle(row);
}

/**
 * The handle a gardener goes by now, given one they have given up
 * (`OVE-503`). `null` for a handle that was never retired — current, unknown
 * or malformed.
 *
 * A handle is never handed to a second person (`normalized_handle` is the
 * registry's primary key), so a retired handle names exactly one gardener,
 * for ever. That is what lets an entry's old address — `/@{old}/post/{n}` —
 * answer one 308 to `/@{new}/post/{n}`: the "one prefix rule" ADR-0029 left
 * for the day handles could change. The profile's own old address stays a
 * 410; only the gardener's work follows them.
 */
export async function resolveRetiredPublicHandle(
  rawHandle: string,
  executor: QueryExecutor = db,
): Promise<string | null> {
  const parsed = parsePublicHandleSyntax(rawHandle);
  if (!parsed.ok) return null;
  const row = await buildRetiredPublicHandleQuery(
    executor,
    parsed.normalizedHandle,
  ).executeTakeFirst();
  return row?.handle ?? null;
}

export function buildRetiredPublicHandleQuery(
  executor: QueryExecutor,
  normalizedHandle: string,
) {
  return executor
    .selectFrom("user_handle_registry as retired")
    .innerJoin("user_handle_registry as current", (join) =>
      join
        .onRef("current.user_id", "=", "retired.user_id")
        .on("current.lifecycle_state", "=", "current"),
    )
    .select("current.normalized_handle as handle")
    .where("retired.normalized_handle", "=", normalizedHandle)
    .where("retired.lifecycle_state", "=", "retired")
    .limit(1);
}

export function classifyPublicProfileLifecycle(
  row: PublicProfileLifecycleRow | null | undefined,
): PublicProfileLifecycleLookup {
  if (
    (row?.handleLifecycleState !== "current" &&
      row?.handleLifecycleState !== "retired") ||
    row.profileLifecycleState !== "active" ||
    row.removedAt !== null
  ) {
    return { status: "not_found" };
  }

  return row.handleLifecycleState === "retired"
    ? { status: "gone" }
    : { status: "active" };
}

async function loadPublicProfileEvidencePage(
  profile: PublicProfileInternalRow,
  locale: PublicLocale,
  request: PublicProfileListRequest,
  executor: QueryExecutor,
) {
  const entriesPage = normalizeProfileListPage(request.entriesPage);
  const objectsPage = normalizeProfileListPage(request.objectsPage);
  const [
    entrySummary,
    followerSummary,
    followingSummary,
    entries,
    objects,
    avatar,
  ] = await Promise.all([
    buildPublicProfileEntrySummaryQuery(
      executor,
      profile.userId,
    ).executeTakeFirst(),
    buildPublicProfileFollowerCountQuery(
      executor,
      profile.userId,
    ).executeTakeFirst(),
    buildPublicProfileFollowingCountQuery(
      executor,
      profile.userId,
    ).executeTakeFirst(),
    buildPublicProfileEntryPageQuery(executor, profile.userId, {
      page: entriesPage,
      pageSize: PUBLIC_PROFILE_ENTRY_PAGE_SIZE,
    }).execute(),
    buildPublicProfileObjectEvidenceQuery(executor, profile.userId, {
      page: objectsPage,
      pageSize: PUBLIC_PROFILE_OBJECT_PAGE_SIZE,
    }).execute(),
    profile.avatarMediaAssetId
      ? buildPublicProfileAvatarEvidenceQuery(
          executor,
          profile.userId,
          profile.avatarMediaAssetId,
        ).executeTakeFirst()
      : Promise.resolve(null),
  ]);
  const entryIds = entries.map((entry) => entry.entryId);
  const objectIds = objects.map((object) => object.objectId);
  // The profile's entries are its owner's, object or space; the ids arrive
  // already filtered by the profile's own read.
  const scope = { includeSpaceEntries: true };
  const [entryMedia, entryTopics, objectMedia] = await Promise.all([
    entryIds.length > 0
      ? buildPublicFeedMediaQuery(executor, entryIds, scope).execute()
      : Promise.resolve([]),
    entryIds.length > 0
      ? buildPublicFeedTopicsForEntriesQuery(
          executor,
          entryIds,
          scope,
        ).execute()
      : Promise.resolve([]),
    objectIds.length > 0
      ? buildPublicProfileObjectMediaEvidenceQuery(
          executor,
          profile.userId,
          objectIds,
        ).execute()
      : Promise.resolve([]),
  ]);
  const mediaExtras = await readMediaVariantExtras(executor, [
    ...objectMedia.map((row) => row.mediaAssetId),
    ...entryMedia.map((row) => row.id),
  ]);

  return serializePublicProfileEvidencePage({
    mediaExtras,
    locale,
    request: { entriesPage, objectsPage },
    profile: {
      ...profile,
      avatarDerivativeKey: avatar?.derivativeKey ?? null,
      avatarAltText: avatar?.altText ?? null,
    },
    entrySummary,
    followerSummary,
    followingSummary,
    objects,
    objectMedia,
    entries,
    entryMedia,
    entryTopics,
  });
}

/**
 * Whether a profile view asks for a page past the end of its list — so the
 * proxy can answer 404 before anything streams, the way `/journals` does. A
 * page past the end is otherwise a `200` with an empty list: infinite
 * crawlable space behind one parameter.
 */
export async function isPublicProfilePageBeyondTheEnd(
  rawHandle: string,
  list: "entries" | "objects",
  page: number,
  executor: QueryExecutor = db,
): Promise<boolean> {
  if (page <= 1) return false;
  const parsed = parsePublicHandleSyntax(rawHandle);
  if (!parsed.ok) return false;
  const profile = await buildPublicProfileByNormalizedHandleQuery(
    executor,
    parsed.normalizedHandle,
  ).executeTakeFirst();
  if (!profile) return false;
  const summary = await buildPublicProfileEntrySummaryQuery(
    executor,
    profile.userId,
  ).executeTakeFirst();
  const total = numericCount(
    list === "entries" ? summary?.publicEntryCount : summary?.publicObjectCount,
  );
  return (
    page >
    profileListPageCount(
      total,
      list === "entries"
        ? PUBLIC_PROFILE_ENTRY_PAGE_SIZE
        : PUBLIC_PROFILE_OBJECT_PAGE_SIZE,
    )
  );
}

export async function resolvePublicHandleMentionTarget(
  rawHandle: string,
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
  executor: QueryExecutor = db,
): Promise<PublicHandleMentionTarget | null> {
  const parsed = parsePublicHandleSyntax(rawHandle);
  if (!parsed.ok) return null;

  const profile = await buildPublicProfileByNormalizedHandleQuery(
    executor,
    parsed.normalizedHandle,
  ).executeTakeFirst();

  if (!profile) return null;

  return {
    handle: profile.handle,
    mention: `@${profile.handle}`,
    profilePath: publicProfilePath(locale, profile.handle),
  };
}

export function normalizePublicHandleInput(
  rawHandle: string,
): PublicHandleValidationResult {
  const parsed = parsePublicHandleSyntax(rawHandle);
  if (!parsed.ok) {
    return { ok: false, error: "format" };
  }

  const moderation = evaluatePublicIdentity({
    surface: "handle",
    value: parsed.normalizedHandle,
  });
  if (!moderation.ok) {
    return { ok: false, error: "unavailable" };
  }

  return {
    ok: true,
    handle: moderation.value,
    normalizedHandle: moderation.value,
    mention: `@${moderation.value}`,
  };
}

export function serializePublicProfilePage(input: {
  locale?: PublicLocale;
  profile: Pick<
    PublicProfileInternalRow,
    "userId" | "handle" | "displayName" | "avatarUrl"
  >;
  entrySummary?: PublicProfileEntrySummaryRow | null;
  lineageSummary?: PublicProfileLineageSummaryRow | null;
  links: PublicProfileLinkRow[];
}): PublicProfilePage {
  return {
    handle: input.profile.handle,
    mention: `@${input.profile.handle}`,
    displayName: input.profile.displayName,
    avatarUrl: input.profile.avatarUrl,
    summary: {
      publicEntryCount: numericCount(input.entrySummary?.publicEntryCount),
      publicObjectCount: numericCount(input.entrySummary?.publicObjectCount),
      confirmedLineageEdgeCount: numericCount(
        input.lineageSummary?.confirmedLineageEdgeCount,
      ),
    },
    links: input.links.flatMap((link) =>
      link.publicSlug
        ? [
            {
              kind: "journal_entry" as const,
              // Every entry on a profile is that profile's own, so the page's
              // handle addresses all of them (ADR-0029 D9).
              href: publicJournalEntryAddress({
                authorHandle: input.profile.handle,
                entryNumber: link.entryNumber,
                publicSlug: link.publicSlug,
              }),
              entryDate: link.entryDate,
            },
          ]
        : [],
    ),
  };
}

export function serializePublicProfileEvidencePage(input: {
  locale: PublicLocale;
  request?: PublicProfileListRequest;
  profile: {
    userId: string;
    handle: string;
    displayName: string | null;
    bio: string | null;
    languages: string[];
    locationVisibility: string;
    coarseRegionCode: string | null;
    relationshipVisibility: string;
    avatarDerivativeKey: string | null;
    avatarAltText: string | null;
  };
  entrySummary?: PublicProfileEntrySummaryRow | null;
  followerSummary?: PublicProfileCountRow | null;
  followingSummary?: PublicProfileCountRow | null;
  objects: PublicProfileObjectRow[];
  objectMedia: PublicProfileObjectMediaRow[];
  entries: PublicProfileEntryRow[];
  entryMedia?: PublicFeedMediaRow[];
  entryTopics?: PublicFeedTopicRow[];
  /** OVE-371 placeholder/variant columns, keyed by media asset id. */
  mediaExtras?: ReadonlyMap<string, MediaVariantExtras>;
}): PublicProfileEvidencePage {
  const request = input.request ?? FIRST_PUBLIC_PROFILE_PAGES;
  const displayName = input.profile.displayName ?? `@${input.profile.handle}`;
  const avatarUrl = publicMediaUrl(input.profile.avatarDerivativeKey);
  const objectMedia = firstObjectMediaByObject(input.objectMedia);
  const mediaByEntry = Object.groupBy(
    input.entryMedia ?? [],
    (row) => row.entryId,
  );
  const topicsByEntry = Object.groupBy(
    input.entryTopics ?? [],
    (row) => row.entryId,
  );
  const objects = input.objects
    .slice(0, PUBLIC_PROFILE_OBJECT_PAGE_SIZE)
    .flatMap((row) => {
      const objectKind = normalizePlantObjectKind(row.objectKind);
      if (!objectKind) return [];
      const cover = objectMedia.get(row.objectId);
      const identity = publicObjectIdentity(row);

      return [
        {
          objectId: row.objectId,
          displayName: row.displayName,
          objectKind,
          identityLabel: identity.label,
          identityState: identity.state,
          latestEntryDate: row.latestEntryDate,
          publicEntryCount: numericCount(row.publicEntryCount),
          publicPath: publicObjectPassportAddress({
            authorHandle: input.profile.handle,
            publicSlug: row.publicSlug,
            plantObjectId: row.objectId,
          }),
          coverImageUrl: publicMediaUrl(cover?.derivativeKey),
          coverImageAlt: cover?.altText?.trim() || row.displayName,
          coverFocalX: cover?.derivativeKey
            ? Number(cover.focalX ?? 0.5)
            : null,
          coverFocalY: cover?.derivativeKey
            ? Number(cover.focalY ?? 0.5)
            : null,
          coverIntrinsicWidth: cover?.intrinsicWidth ?? null,
          coverIntrinsicHeight: cover?.intrinsicHeight ?? null,
          coverPlaceholderDataUri: cover?.derivativeKey
            ? (input.mediaExtras?.get(cover.mediaAssetId)?.placeholderDataUri ??
              null)
            : null,
          coverVariantLongEdges: cover?.derivativeKey
            ? (input.mediaExtras?.get(cover.mediaAssetId)?.variantLongEdges ??
              [])
            : [],
        },
      ];
    });
  const author = {
    handle: input.profile.handle,
    displayName,
    avatarUrl,
    profilePath: publicProfilePath(input.locale, input.profile.handle),
  };
  const entries = input.entries
    .slice(0, PUBLIC_PROFILE_ENTRY_PAGE_SIZE)
    .flatMap((row): PublicProfileEntry[] => {
      if (!row.publicSlug || !row.publishedAt) return [];
      const objectKind = normalizePlantObjectKind(row.objectKind);
      const object =
        row.entryScope === "object" &&
        row.objectId &&
        row.objectDisplayName &&
        objectKind
          ? {
              id: row.objectId,
              displayName: row.objectDisplayName,
              kind: objectKind,
              publicPath: publicObjectPassportAddress({
                authorHandle: input.profile.handle,
                publicSlug: row.objectPublicSlug,
                plantObjectId: row.objectId,
              }),
              safeRegionCode:
                row.objectLocationVisibility === "region" &&
                isCoarseRegionCode(row.objectCoarseRegionCode)
                  ? row.objectCoarseRegionCode
                  : null,
            }
          : null;

      return [
        {
          id: row.entryId,
          title: row.title,
          excerpt: buildPublicFeedExcerpt(row.body),
          excerptTruncated: isPublicFeedExcerptTruncated(row.body),
          sourceLanguage: normalizePublicContentLanguage(row.sourceLanguage),
          entryDate: row.entryDate,
          publishedAt: row.publishedAt,
          publicPath: publicJournalEntryAddress({
            authorHandle: input.profile.handle,
            entryNumber: row.entryNumber,
            publicSlug: row.publicSlug,
          }),
          object,
          space: object ? null : { displayName: row.spaceDisplayName },
          author,
          media: serializePublicFeedMedia(mediaByEntry[row.entryId] ?? [], {
            mediaExtras: input.mediaExtras,
          }),
          topics: (topicsByEntry[row.entryId] ?? []).map((topic) => ({
            slug: topic.slug,
            label: localizeTopicLabel(input.locale, topic.slug, topic.label),
          })),
        },
      ];
    });
  const publicObjectCount = numericCount(input.entrySummary?.publicObjectCount);
  const publicEntryCount = numericCount(input.entrySummary?.publicEntryCount);

  return {
    handle: input.profile.handle,
    mention: `@${input.profile.handle}`,
    displayName,
    avatarUrl,
    avatarAlt: publicSafeText(input.profile.avatarAltText) || displayName,
    // OVE-234: legacy bios written before the firewall are withheld from the
    // public serializer instead of being rendered or indexed.
    bio: publicSafeText(input.profile.bio),
    languages: normalizeProfileLanguages(input.profile.languages),
    coarseRegionCode:
      input.profile.locationVisibility === "region"
        ? normalizeCoarseRegionCode(input.profile.coarseRegionCode)
        : null,
    summary: {
      publicEntryCount,
      publicObjectCount,
      objectKinds: {
        plant: numericCount(input.entrySummary?.publicPlantCount),
        animal: numericCount(input.entrySummary?.publicAnimalCount),
      },
      relationships:
        input.profile.relationshipVisibility === "counts"
          ? {
              followers: numericCount(input.followerSummary?.count),
              following: numericCount(input.followingSummary?.count),
            }
          : null,
    },
    entries: {
      items: entries,
      page: request.entriesPage,
      pageCount: profileListPageCount(
        publicEntryCount,
        PUBLIC_PROFILE_ENTRY_PAGE_SIZE,
      ),
    },
    objects: {
      items: objects,
      page: request.objectsPage,
      pageCount: profileListPageCount(
        publicObjectCount,
        PUBLIC_PROFILE_OBJECT_PAGE_SIZE,
      ),
    },
    qualityClass:
      input.profile.locationVisibility === "region" &&
      !normalizeCoarseRegionCode(input.profile.coarseRegionCode)
        ? "partial"
        : "verified",
  };
}

export function buildUserPublicProfileByUserIdQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
    .selectFrom("user_public_profiles")
    .selectAll()
    .where("user_id", "=", userId);
}

export function buildPublicProfileByNormalizedHandleQuery(
  executor: QueryExecutor,
  normalizedHandle: string,
) {
  return executor
    .selectFrom("user_public_profiles")
    .select([
      "user_id as userId",
      "handle",
      "display_name as displayName",
      "avatar_url as avatarUrl",
      "avatar_media_asset_id as avatarMediaAssetId",
      "bio",
      "languages",
      "location_visibility as locationVisibility",
      "coarse_region_code as coarseRegionCode",
      "relationship_visibility as relationshipVisibility",
    ])
    .where("normalized_handle", "=", normalizedHandle)
    .where("profile_lifecycle_state", "=", "active")
    .where("removed_at", "is", null);
}

export function buildPublicProfileLifecycleQuery(
  executor: QueryExecutor,
  normalizedHandle: string,
  viewerUserId: string | null = null,
) {
  let query = executor
    .selectFrom("user_handle_registry")
    .leftJoin("user_public_profiles", (join) =>
      join.onRef(
        "user_public_profiles.user_id",
        "=",
        "user_handle_registry.user_id",
      ),
    )
    .select([
      "user_handle_registry.lifecycle_state as handleLifecycleState",
      "user_public_profiles.profile_lifecycle_state as profileLifecycleState",
      "user_public_profiles.removed_at as removedAt",
    ])
    .where("user_handle_registry.normalized_handle", "=", normalizedHandle);

  if (viewerUserId) {
    query = query.where(
      sql<boolean>`
        not exists (
          select 1
          from profile_blocks block
          where block.block_state = 'active'
            and (
              (
                block.blocker_user_id = ${viewerUserId}::uuid
                and block.blocked_user_id = user_handle_registry.user_id
              )
              or (
                block.blocker_user_id = user_handle_registry.user_id
                and block.blocked_user_id = ${viewerUserId}::uuid
              )
            )
        )
      `,
    );
  }

  return query;
}

export function buildPublicProfileAvatarEvidenceQuery(
  executor: QueryExecutor,
  userId: string,
  mediaAssetId: string,
) {
  return executor
    .selectFrom("media_assets")
    .select(["derivative_key as derivativeKey", "alt_text as altText"])
    .where("id", "=", mediaAssetId)
    .where("owner_user_id", "=", userId)
    .where(publicMediaEligibilityPredicate());
}

export function buildPublicProfileEntrySummaryQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .leftJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .select(({ fn }) => [
      fn.count<number>("journal_entries.id").as("publicEntryCount"),
      sql<number>`count(distinct ${sql.ref(
        "journal_entries.plant_object_id",
      )})`.as("publicObjectCount"),
      sql<number>`count(distinct case when ${sql.ref(
        "plant_objects.object_kind",
      )} = 'plant' then ${sql.ref("journal_entries.plant_object_id")} end)`.as(
        "publicPlantCount",
      ),
      sql<number>`count(distinct case when ${sql.ref(
        "plant_objects.object_kind",
      )} = 'animal' then ${sql.ref("journal_entries.plant_object_id")} end)`.as(
        "publicAnimalCount",
      ),
    ])
    .where("journal_entries.owner_user_id", "=", userId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .where(publicLaunchSurfacePredicates());
}

export function buildPublicProfileLineageSummaryQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
    .selectFrom("lineage_provenance_edges")
    .innerJoin("journal_entries as subject_public_entries", (join) =>
      join
        .onRef(
          "subject_public_entries.plant_object_id",
          "=",
          "lineage_provenance_edges.subject_plant_object_id",
        )
        .onRef(
          "subject_public_entries.owner_user_id",
          "=",
          "lineage_provenance_edges.owner_user_id",
        )
        .on("subject_public_entries.visibility", "=", "public")
        .on("subject_public_entries.lifecycle_state", "=", "active")
        .on("subject_public_entries.public_gone_at", "is", null)
        .on("subject_public_entries.public_slug", "is not", null)
        .on(
          publicLaunchSurfacePredicates(
            sql.ref<string | null>("subject_public_entries.content_class"),
          ),
        ),
    )
    .innerJoin("journal_entries as source_public_entries", (join) =>
      join
        .onRef(
          "source_public_entries.plant_object_id",
          "=",
          "lineage_provenance_edges.source_plant_object_id",
        )
        .onRef(
          "source_public_entries.owner_user_id",
          "=",
          "lineage_provenance_edges.source_owner_user_id",
        )
        .on("source_public_entries.visibility", "=", "public")
        .on("source_public_entries.lifecycle_state", "=", "active")
        .on("source_public_entries.public_gone_at", "is", null)
        .on("source_public_entries.public_slug", "is not", null)
        .on(
          publicLaunchSurfacePredicates(
            sql.ref<string | null>("source_public_entries.content_class"),
          ),
        ),
    )
    .select(() => [
      sql<number>`count(distinct ${sql.ref("lineage_provenance_edges.id")})`.as(
        "confirmedLineageEdgeCount",
      ),
    ])
    .where((eb) =>
      eb.or([
        eb("lineage_provenance_edges.owner_user_id", "=", userId),
        eb("lineage_provenance_edges.source_owner_user_id", "=", userId),
      ]),
    )
    .where("lineage_provenance_edges.source_kind", "=", "own_object")
    .where("lineage_provenance_edges.source_plant_object_id", "is not", null)
    .where("lineage_provenance_edges.source_owner_user_id", "is not", null)
    .where("lineage_provenance_edges.consent_state", "=", "confirmed")
    .where(
      "lineage_provenance_edges.visibility_policy",
      "=",
      "owner_only_until_confirmed",
    )
    .where("lineage_provenance_edges.erasure_state", "=", "active");
}

export function buildPublicProfileObjectEvidenceQuery(
  executor: QueryExecutor,
  userId: string,
  input: { page: number; pageSize: number } = {
    page: 1,
    pageSize: PUBLIC_PROFILE_OBJECT_PAGE_SIZE,
  },
) {
  return executor
    .selectFrom("plant_objects")
    .innerJoin("journal_entries", (join) =>
      join
        .onRef("journal_entries.plant_object_id", "=", "plant_objects.id")
        .onRef(
          "journal_entries.owner_user_id",
          "=",
          "plant_objects.owner_user_id",
        )
        .on("journal_entries.entry_scope", "=", "object")
        .on("journal_entries.visibility", "=", "public")
        .on("journal_entries.lifecycle_state", "=", "active")
        .on("journal_entries.public_gone_at", "is", null)
        .on("journal_entries.public_slug", "is not", null)
        .on("journal_entries.published_at", "is not", null)
        .on(publicLaunchSurfacePredicates()),
    )
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.created_by_user_id", "is", null)
        .on("catalog_items.identity_state", "=", "active"),
    )
    .select([
      "plant_objects.id as objectId",
      "plant_objects.public_slug as publicSlug",
      "plant_objects.display_name as displayName",
      "plant_objects.object_kind as objectKind",
      "catalog_items.canonical_name as catalogCanonicalName",
      catalogKindSql("catalog_items").as("catalogKind"),
      "plant_objects.variety_text as varietyText",
      "plant_objects.variety_state as varietyState",
      sql<Date | string>`max(${sql.ref("journal_entries.entry_date")})`.as(
        "latestEntryDate",
      ),
      sql<number>`count(distinct ${sql.ref("journal_entries.id")})`.as(
        "publicEntryCount",
      ),
    ])
    .where("plant_objects.owner_user_id", "=", userId)
    .groupBy([
      "plant_objects.id",
      "plant_objects.public_slug",
      "plant_objects.display_name",
      "plant_objects.object_kind",
      "catalog_items.canonical_name",
      catalogKindSql("catalog_items"),
      "plant_objects.variety_text",
      "plant_objects.variety_state",
    ])
    .orderBy(sql`max(${sql.ref("journal_entries.entry_date")})`, "desc")
    .orderBy("plant_objects.created_at", "desc")
    .orderBy("plant_objects.id", "asc")
    .offset((normalizeProfileListPage(input.page) - 1) * input.pageSize)
    .limit(input.pageSize);
}

/**
 * One page of everything the gardener published, newest publication first —
 * entries about one object and entries about a whole space alike.
 *
 * The object is joined by id and owner only. The old read also required the
 * object to sit in the entry's space, so an entry whose object had since moved
 * to another space was listed as an entry about the old space.
 */
export function buildPublicProfileEntryPageQuery(
  executor: QueryExecutor,
  userId: string,
  input: { page: number; pageSize: number },
) {
  return executor
    .selectFrom("journal_entries")
    .innerJoin("spaces", (join) =>
      join
        .onRef("spaces.id", "=", "journal_entries.space_id")
        .onRef("spaces.owner_user_id", "=", "journal_entries.owner_user_id"),
    )
    .leftJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .select([
      "journal_entries.id as entryId",
      "journal_entries.public_slug as publicSlug",
      "journal_entries.author_entry_number as entryNumber",
      "journal_entries.title",
      "journal_entries.body",
      "journal_entries.source_language as sourceLanguage",
      "journal_entries.entry_date as entryDate",
      "journal_entries.published_at as publishedAt",
      "journal_entries.entry_scope as entryScope",
      "plant_objects.id as objectId",
      "plant_objects.public_slug as objectPublicSlug",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.object_kind as objectKind",
      "plant_objects.location_visibility as objectLocationVisibility",
      "plant_objects.coarse_region_code as objectCoarseRegionCode",
      "spaces.display_name as spaceDisplayName",
    ])
    .where("journal_entries.owner_user_id", "=", userId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .where(publicLaunchSurfacePredicates())
    .orderBy("journal_entries.published_at", "desc")
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("journal_entries.id", "asc")
    .offset((normalizeProfileListPage(input.page) - 1) * input.pageSize)
    .limit(input.pageSize);
}

/**
 * One cover for each object on the page: the photograph of its newest public
 * entry, that entry's own cover before its inline photographs.
 *
 * Ranked per object. The old read took the newest 96 photographs of the whole
 * profile and picked from those, so one object with a busy week could leave
 * every other object on the page without a cover.
 */
export function buildPublicProfileObjectMediaEvidenceQuery(
  executor: QueryExecutor,
  userId: string,
  objectIds: readonly string[],
) {
  const ranked = executor
    .selectFrom("media_assets")
    .innerJoin("journal_entries", (join) =>
      join
        .onRef("journal_entries.id", "=", "media_assets.journal_entry_id")
        .onRef(
          "journal_entries.owner_user_id",
          "=",
          "media_assets.owner_user_id",
        )
        .on("journal_entries.entry_scope", "=", "object")
        .on("journal_entries.visibility", "=", "public")
        .on("journal_entries.lifecycle_state", "=", "active")
        .on("journal_entries.public_gone_at", "is", null)
        .on("journal_entries.public_slug", "is not", null)
        .on("journal_entries.published_at", "is not", null)
        .on(publicLaunchSurfacePredicates()),
    )
    .innerJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .select([
      "plant_objects.id as object_id",
      "journal_entries.id as entry_id",
      "media_assets.id as media_asset_id",
      "media_assets.derivative_key as derivative_key",
      "media_assets.alt_text as alt_text",
      "media_assets.focal_x as focal_x",
      "media_assets.focal_y as focal_y",
      "media_assets.intrinsic_width as intrinsic_width",
      "media_assets.intrinsic_height as intrinsic_height",
      sql<number>`row_number() over (
        partition by ${sql.ref("plant_objects.id")}
        order by
          ${sql.ref("journal_entries.published_at")} desc,
          ${sql.ref("journal_entries.entry_date")} desc,
          case
            when ${sql.ref("media_assets.id")} = ${sql.ref("journal_entries.cover_media_asset_id")}
              then 0
            else 1
          end asc,
          ${sql.ref("media_assets.document_position")} asc nulls last,
          ${sql.ref("media_assets.id")} asc
      )`.as("media_rank"),
    ])
    .where("media_assets.owner_user_id", "=", userId)
    .where("plant_objects.id", "in", [...objectIds])
    .where(publicMediaEligibilityPredicate())
    .where((eb) =>
      eb.or([
        eb(
          "media_assets.id",
          "=",
          eb.ref("journal_entries.cover_media_asset_id"),
        ),
        eb("media_assets.usage_role", "=", "inline"),
      ]),
    )
    .as("ranked_cover");

  return executor
    .selectFrom(ranked)
    .select([
      "ranked_cover.object_id as objectId",
      "ranked_cover.entry_id as entryId",
      "ranked_cover.media_asset_id as mediaAssetId",
      "ranked_cover.derivative_key as derivativeKey",
      "ranked_cover.alt_text as altText",
      "ranked_cover.focal_x as focalX",
      "ranked_cover.focal_y as focalY",
      "ranked_cover.intrinsic_width as intrinsicWidth",
      "ranked_cover.intrinsic_height as intrinsicHeight",
    ])
    .where("ranked_cover.media_rank", "=", 1);
}

export function buildPublicProfileFollowerCountQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
    .selectFrom("profile_follows")
    .innerJoin("user_public_profiles as follower_profiles", (join) =>
      join
        .onRef(
          "follower_profiles.user_id",
          "=",
          "profile_follows.follower_user_id",
        )
        .on("follower_profiles.profile_lifecycle_state", "=", "active")
        .on("follower_profiles.removed_at", "is", null),
    )
    .select(({ fn }) => [fn.count<number>("profile_follows.id").as("count")])
    .where("profile_follows.target_user_id", "=", userId)
    .where("profile_follows.follow_state", "=", "active")
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("profile_blocks")
            .select("profile_blocks.id")
            .where("profile_blocks.block_state", "=", "active")
            .where(sql<boolean>`(
              (${sql.ref("profile_blocks.blocker_user_id")} = ${userId}
                and ${sql.ref("profile_blocks.blocked_user_id")} = ${sql.ref("profile_follows.follower_user_id")})
              or
              (${sql.ref("profile_blocks.blocker_user_id")} = ${sql.ref("profile_follows.follower_user_id")}
                and ${sql.ref("profile_blocks.blocked_user_id")} = ${userId})
            )`),
        ),
      ),
    );
}

export function buildPublicProfileFollowingCountQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
    .selectFrom("profile_follows")
    .innerJoin("user_public_profiles as target_profiles", (join) =>
      join
        .onRef("target_profiles.user_id", "=", "profile_follows.target_user_id")
        .on("target_profiles.profile_lifecycle_state", "=", "active")
        .on("target_profiles.removed_at", "is", null),
    )
    .select(({ fn }) => [fn.count<number>("profile_follows.id").as("count")])
    .where("profile_follows.follower_user_id", "=", userId)
    .where("profile_follows.follow_state", "=", "active")
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("profile_blocks")
            .select("profile_blocks.id")
            .where("profile_blocks.block_state", "=", "active")
            .where(sql<boolean>`(
              (${sql.ref("profile_blocks.blocker_user_id")} = ${userId}
                and ${sql.ref("profile_blocks.blocked_user_id")} = ${sql.ref("profile_follows.target_user_id")})
              or
              (${sql.ref("profile_blocks.blocker_user_id")} = ${sql.ref("profile_follows.target_user_id")}
                and ${sql.ref("profile_blocks.blocked_user_id")} = ${userId})
            )`),
        ),
      ),
    );
}

export function buildPublicProfileLinksQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .select([
      "journal_entries.public_slug as publicSlug",
      "journal_entries.author_entry_number as entryNumber",
      "journal_entries.entry_date as entryDate",
    ])
    .where("journal_entries.owner_user_id", "=", userId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where(publicLaunchSurfacePredicates())
    .orderBy("journal_entries.published_at", "desc")
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(MAX_PROFILE_LINKS);
}

function numericCount(value: string | number | bigint | null | undefined) {
  return Number(value ?? 0);
}

function firstObjectMediaByObject(rows: PublicProfileObjectMediaRow[]) {
  const result = new Map<string, PublicProfileObjectMediaRow>();
  for (const row of rows) {
    if (!row.derivativeKey || result.has(row.objectId)) continue;
    result.set(row.objectId, row);
  }
  return result;
}

/** A page number a list can be read at: 1 up to the policy's ceiling. */
function normalizeProfileListPage(page: number) {
  return Number.isSafeInteger(page) && page >= 1
    ? Math.min(page, PUBLIC_PROFILE_MAX_PAGE)
    : 1;
}

function profileListPageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

function publicMediaUrl(key: string | null | undefined) {
  return key ? getPublicDerivativeUrl(key) : null;
}

function publicObjectIdentity(row: PublicProfileObjectRow): {
  label: string | null;
  state: PublicProfileObjectEvidence["identityState"];
} {
  if (row.catalogCanonicalName && normalizeCatalogKind(row.catalogKind)) {
    return { label: row.catalogCanonicalName, state: "confirmed" };
  }
  // A gardener's own name is a private label (ADR-0026 D6); only a catalog
  // name that lost its card is still worth showing as provisional.
  if (row.varietyState === "selected" && row.varietyText?.trim()) {
    return { label: row.varietyText.trim(), state: "provisional" };
  }
  return { label: null, state: "unknown" };
}

function normalizeCatalogKind(value: string | null): CatalogKind | null {
  return value === "plant_variety" || value === "species" || value === "breed"
    ? value
    : null;
}

function normalizePlantObjectKind(
  value: string | null,
): PlantObjectKind | null {
  return value === "plant" || value === "animal" ? value : null;
}

function normalizeProfileLanguages(values: readonly string[]) {
  return [...new Set(values)].filter((value): value is PublicProfileLanguage =>
    PUBLIC_PROFILE_LANGUAGES.has(value as PublicProfileLanguage),
  );
}

function isPublicHandleUpdateStatus(
  value: string,
): value is PublicHandleUpdateStatus {
  return (
    value === "updated" ||
    value === "unchanged" ||
    value === "format" ||
    value === "unavailable" ||
    value === "cooldown"
  );
}

function publicSafeText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}
