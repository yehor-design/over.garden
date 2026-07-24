import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  CatalogKind,
  Database,
  PlantObjectKind,
  UserPublicProfile,
} from "@/db/schema";
import {
  publicLineageObjectPath,
  publicJournalEntryPath,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import {
  normalizeCoarseRegionCode,
  type CoarseRegionCode,
} from "@/lib/garden/regions";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import { getPublicDerivativeUrl } from "@/lib/storage";
import {
  evaluatePublicIdentity,
  parsePublicHandleSyntax,
} from "@/server/identity-policy";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const MAX_PROFILE_LINKS = 5;
export const PUBLIC_PROFILE_OBJECT_PREVIEW_SIZE = 6;
export const PUBLIC_PROFILE_OBJECT_LIMIT = 12;
export const PUBLIC_PROFILE_JOURNAL_PREVIEW_SIZE = 8;
export const PUBLIC_PROFILE_JOURNAL_LIMIT = 16;
const PUBLIC_PROFILE_MEDIA_LIMIT = 96;

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
}

export interface PublicProfileJournalEvidence {
  entryId: string;
  title: string;
  bodyPreview: string;
  entryDate: Date | string;
  publishedAt: Date | string;
  publicPath: string;
  context: {
    kind: "object" | "space";
    label: string;
    publicPath: string | null;
    objectKind: PlantObjectKind | null;
  };
  coverImageUrl: string | null;
  coverImageAlt: string;
  coverFocalX: number | null;
  coverFocalY: number | null;
  coverIntrinsicWidth: number | null;
  coverIntrinsicHeight: number | null;
}

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
    confirmedLineageEdgeCount: number;
    relationships: {
      followers: number;
      following: number;
    } | null;
  };
  objects: PublicProfileObjectEvidence[];
  journals: PublicProfileJournalEvidence[];
  hasMoreObjects: boolean;
  hasMoreJournals: boolean;
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
  entryDate: Date | string;
}

interface PublicProfileCountRow {
  count: string | number | bigint;
}

interface PublicProfileObjectRow {
  objectId: string;
  displayName: string;
  objectKind: string;
  catalogCanonicalName: string | null;
  catalogKind: string | null;
  varietyText: string | null;
  varietyState: string;
  latestEntryDate: Date | string;
  publicEntryCount: string | number | bigint;
}

interface PublicProfileJournalRow {
  entryId: string;
  publicSlug: string | null;
  title: string;
  body: string;
  entryDate: Date | string;
  publishedAt: Date | string | null;
  entryScope: string;
  objectId: string | null;
  objectDisplayName: string | null;
  objectKind: string | null;
  spaceDisplayName: string;
}

interface PublicProfileObjectMediaRow {
  objectId: string;
  entryId: string;
  derivativeKey: string | null;
  altText: string | null;
  focalX: number | null;
  focalY: number | null;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
}

interface PublicProfileJournalMediaRow {
  entryId: string;
  derivativeKey: string | null;
  altText: string | null;
  focalX: number | null;
  focalY: number | null;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
}

interface PublicProfileLifecycleRow {
  handleLifecycleState: string;
  profileVisibility: string | null;
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
  executor: QueryExecutor = db,
): Promise<PublicProfileEvidencePage | null> {
  const parsed = parsePublicHandleSyntax(rawHandle);
  if (!parsed.ok) return null;

  const profile = await buildPublicProfileByNormalizedHandleQuery(
    executor,
    parsed.normalizedHandle,
  ).executeTakeFirst();

  if (!profile) return null;

  return loadPublicProfileEvidencePage(profile, locale, executor);
}

export async function getPublicProfileEvidencePreviewByUserId(
  userId: string,
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
  executor: QueryExecutor = db,
): Promise<PublicProfileEvidencePage | null> {
  const profile = await buildPublicProfilePreviewByUserIdQuery(
    executor,
    userId,
  ).executeTakeFirst();
  if (!profile) return null;

  return loadPublicProfileEvidencePage(profile, locale, executor);
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

export function classifyPublicProfileLifecycle(
  row: PublicProfileLifecycleRow | null | undefined,
): PublicProfileLifecycleLookup {
  if (
    (row?.handleLifecycleState !== "current" &&
      row?.handleLifecycleState !== "retired") ||
    row.profileVisibility !== "public" ||
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
  executor: QueryExecutor,
) {
  const [
    entrySummary,
    lineageSummary,
    followerSummary,
    followingSummary,
    objects,
    journals,
    objectMedia,
    avatar,
  ] = await Promise.all([
    buildPublicProfileEntrySummaryQuery(
      executor,
      profile.userId,
    ).executeTakeFirst(),
    buildPublicProfileLineageSummaryQuery(
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
    buildPublicProfileObjectEvidenceQuery(executor, profile.userId).execute(),
    buildPublicProfileJournalEvidenceQuery(executor, profile.userId).execute(),
    buildPublicProfileObjectMediaEvidenceQuery(
      executor,
      profile.userId,
    ).execute(),
    profile.avatarMediaAssetId
      ? buildPublicProfileAvatarEvidenceQuery(
          executor,
          profile.userId,
          profile.avatarMediaAssetId,
        ).executeTakeFirst()
      : Promise.resolve(null),
  ]);
  const journalIds = journals.flatMap((entry) =>
    entry.publicSlug ? [entry.entryId] : [],
  );
  const journalMedia =
    journalIds.length > 0
      ? await buildPublicProfileJournalMediaEvidenceQuery(
          executor,
          profile.userId,
          journalIds,
        ).execute()
      : [];

  return serializePublicProfileEvidencePage({
    locale,
    profile: {
      ...profile,
      avatarDerivativeKey: avatar?.derivativeKey ?? null,
      avatarAltText: avatar?.altText ?? null,
    },
    entrySummary,
    lineageSummary,
    followerSummary,
    followingSummary,
    objects,
    objectMedia,
    journals,
    journalMedia,
  });
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
              href: publicJournalEntryPath(link.publicSlug),
              entryDate: link.entryDate,
            },
          ]
        : [],
    ),
  };
}

export function serializePublicProfileEvidencePage(input: {
  locale: PublicLocale;
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
  lineageSummary?: PublicProfileLineageSummaryRow | null;
  followerSummary?: PublicProfileCountRow | null;
  followingSummary?: PublicProfileCountRow | null;
  objects: PublicProfileObjectRow[];
  objectMedia: PublicProfileObjectMediaRow[];
  journals: PublicProfileJournalRow[];
  journalMedia: PublicProfileJournalMediaRow[];
}): PublicProfileEvidencePage {
  const displayName = input.profile.displayName ?? `@${input.profile.handle}`;
  const objectMedia = firstObjectMediaByObject(input.objectMedia);
  const journalMedia = firstJournalMediaByEntry(input.journalMedia);
  const objects = input.objects
    .slice(0, PUBLIC_PROFILE_OBJECT_LIMIT)
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
          publicPath: publicLineageObjectPath(row.objectId),
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
        },
      ];
    });
  const journals = input.journals
    .slice(0, PUBLIC_PROFILE_JOURNAL_LIMIT)
    .flatMap((row) => {
      if (!row.publicSlug || !row.publishedAt) return [];
      const objectKind = normalizePlantObjectKind(row.objectKind);
      const isObject =
        row.entryScope === "object" &&
        row.objectId &&
        row.objectDisplayName &&
        objectKind;
      const cover = journalMedia.get(row.entryId);

      return [
        {
          entryId: row.entryId,
          title: row.title,
          bodyPreview: boundedBodyPreview(row.body),
          entryDate: row.entryDate,
          publishedAt: row.publishedAt,
          publicPath: publicJournalEntryPath(row.publicSlug),
          context: isObject
            ? {
                kind: "object" as const,
                label: row.objectDisplayName as string,
                publicPath: publicLineageObjectPath(row.objectId as string),
                objectKind: objectKind as PlantObjectKind,
              }
            : {
                kind: "space" as const,
                label: row.spaceDisplayName,
                publicPath: null,
                objectKind: null,
              },
          coverImageUrl: publicMediaUrl(cover?.derivativeKey),
          coverImageAlt:
            cover?.altText?.trim() ||
            (isObject ? (row.objectDisplayName as string) : row.title),
          coverFocalX: cover?.derivativeKey
            ? Number(cover.focalX ?? 0.5)
            : null,
          coverFocalY: cover?.derivativeKey
            ? Number(cover.focalY ?? 0.5)
            : null,
          coverIntrinsicWidth: cover?.intrinsicWidth ?? null,
          coverIntrinsicHeight: cover?.intrinsicHeight ?? null,
        },
      ];
    });
  const publicObjectCount = numericCount(input.entrySummary?.publicObjectCount);
  const publicEntryCount = numericCount(input.entrySummary?.publicEntryCount);

  return {
    handle: input.profile.handle,
    mention: `@${input.profile.handle}`,
    displayName,
    avatarUrl: publicMediaUrl(input.profile.avatarDerivativeKey),
    avatarAlt: input.profile.avatarAltText?.trim() || displayName,
    bio: input.profile.bio?.trim() || null,
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
      confirmedLineageEdgeCount: numericCount(
        input.lineageSummary?.confirmedLineageEdgeCount,
      ),
      relationships:
        input.profile.relationshipVisibility === "counts"
          ? {
              followers: numericCount(input.followerSummary?.count),
              following: numericCount(input.followingSummary?.count),
            }
          : null,
    },
    objects,
    journals,
    hasMoreObjects: publicObjectCount > objects.length,
    hasMoreJournals: publicEntryCount > journals.length,
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
    .where("profile_visibility", "=", "public")
    .where("profile_lifecycle_state", "=", "active")
    .where("removed_at", "is", null);
}

export function buildPublicProfilePreviewByUserIdQuery(
  executor: QueryExecutor,
  userId: string,
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
    .where("user_id", "=", userId)
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
      "user_public_profiles.profile_visibility as profileVisibility",
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
    .where("status", "=", "processed")
    .where("derivative_key", "is not", null)
    .where("revoked_at", "is", null);
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
    .where("journal_entries.published_at", "is not", null);
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
        .on("subject_public_entries.public_slug", "is not", null),
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
        .on("source_public_entries.public_slug", "is not", null),
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
        .on("journal_entries.published_at", "is not", null),
    )
    .leftJoin("catalog_items", (join) =>
      join
        .onRef("catalog_items.id", "=", "plant_objects.catalog_item_id")
        .on("catalog_items.created_by_user_id", "is", null)
        .on("catalog_items.status", "in", ["seeded", "confirmed"]),
    )
    .select([
      "plant_objects.id as objectId",
      "plant_objects.display_name as displayName",
      "plant_objects.object_kind as objectKind",
      "catalog_items.canonical_name as catalogCanonicalName",
      "catalog_items.catalog_kind as catalogKind",
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
      "plant_objects.display_name",
      "plant_objects.object_kind",
      "catalog_items.canonical_name",
      "catalog_items.catalog_kind",
      "plant_objects.variety_text",
      "plant_objects.variety_state",
    ])
    .orderBy(sql`max(${sql.ref("journal_entries.entry_date")})`, "desc")
    .orderBy("plant_objects.created_at", "desc")
    .orderBy("plant_objects.id", "asc")
    .limit(PUBLIC_PROFILE_OBJECT_LIMIT + 1);
}

export function buildPublicProfileJournalEvidenceQuery(
  executor: QueryExecutor,
  userId: string,
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
        )
        .onRef("plant_objects.space_id", "=", "journal_entries.space_id"),
    )
    .select([
      "journal_entries.id as entryId",
      "journal_entries.public_slug as publicSlug",
      "journal_entries.title",
      "journal_entries.body",
      "journal_entries.entry_date as entryDate",
      "journal_entries.published_at as publishedAt",
      "journal_entries.entry_scope as entryScope",
      "plant_objects.id as objectId",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.object_kind as objectKind",
      "spaces.display_name as spaceDisplayName",
    ])
    .where("journal_entries.owner_user_id", "=", userId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .orderBy("journal_entries.published_at", "desc")
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy("journal_entries.created_at", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(PUBLIC_PROFILE_JOURNAL_LIMIT + 1);
}

export function buildPublicProfileObjectMediaEvidenceQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
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
        .on("journal_entries.published_at", "is not", null),
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
      "plant_objects.id as objectId",
      "journal_entries.id as entryId",
      "media_assets.derivative_key as derivativeKey",
      "media_assets.alt_text as altText",
      "media_assets.focal_x as focalX",
      "media_assets.focal_y as focalY",
      "media_assets.intrinsic_width as intrinsicWidth",
      "media_assets.intrinsic_height as intrinsicHeight",
    ])
    .where("media_assets.owner_user_id", "=", userId)
    .where("media_assets.status", "=", "processed")
    .where("media_assets.derivative_key", "is not", null)
    .where("media_assets.revoked_at", "is", null)
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
    .orderBy("journal_entries.published_at", "desc")
    .orderBy("journal_entries.entry_date", "desc")
    .orderBy(
      sql`case
        when ${sql.ref("media_assets.id")} = ${sql.ref("journal_entries.cover_media_asset_id")}
          then 0
        else 1
      end`,
      "asc",
    )
    .orderBy("media_assets.document_position", "asc")
    .orderBy("media_assets.id", "asc")
    .limit(PUBLIC_PROFILE_MEDIA_LIMIT);
}

export function buildPublicProfileJournalMediaEvidenceQuery(
  executor: QueryExecutor,
  userId: string,
  entryIds: readonly string[],
) {
  return executor
    .selectFrom("media_assets")
    .innerJoin("journal_entries", (join) =>
      join
        .onRef("journal_entries.id", "=", "media_assets.journal_entry_id")
        .onRef(
          "journal_entries.owner_user_id",
          "=",
          "media_assets.owner_user_id",
        )
        .on("journal_entries.visibility", "=", "public")
        .on("journal_entries.lifecycle_state", "=", "active")
        .on("journal_entries.public_gone_at", "is", null)
        .on("journal_entries.public_slug", "is not", null)
        .on("journal_entries.published_at", "is not", null),
    )
    .select([
      "journal_entries.id as entryId",
      "media_assets.derivative_key as derivativeKey",
      "media_assets.alt_text as altText",
      "media_assets.focal_x as focalX",
      "media_assets.focal_y as focalY",
      "media_assets.intrinsic_width as intrinsicWidth",
      "media_assets.intrinsic_height as intrinsicHeight",
    ])
    .where("media_assets.owner_user_id", "=", userId)
    .where("media_assets.status", "=", "processed")
    .where("media_assets.derivative_key", "is not", null)
    .where("media_assets.revoked_at", "is", null)
    .where("journal_entries.id", "in", [...entryIds])
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
    .orderBy("journal_entries.published_at", "desc")
    .orderBy(
      sql`case
        when ${sql.ref("media_assets.id")} = ${sql.ref("journal_entries.cover_media_asset_id")}
          then 0
        else 1
      end`,
      "asc",
    )
    .orderBy("media_assets.document_position", "asc")
    .orderBy("media_assets.id", "asc")
    .limit(PUBLIC_PROFILE_MEDIA_LIMIT);
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
        .on("follower_profiles.profile_visibility", "=", "public")
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
        .on("target_profiles.profile_visibility", "=", "public")
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
      "journal_entries.entry_date as entryDate",
    ])
    .where("journal_entries.owner_user_id", "=", userId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
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

function firstJournalMediaByEntry(rows: PublicProfileJournalMediaRow[]) {
  const result = new Map<string, PublicProfileJournalMediaRow>();
  for (const row of rows) {
    if (!row.derivativeKey || result.has(row.entryId)) continue;
    result.set(row.entryId, row);
  }
  return result;
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
  if (row.varietyText?.trim()) {
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
  return value === "plant" || value === "animal"
    ? value
    : null;
}

function normalizeProfileLanguages(values: readonly string[]) {
  return [...new Set(values)].filter((value): value is PublicProfileLanguage =>
    PUBLIC_PROFILE_LANGUAGES.has(value as PublicProfileLanguage),
  );
}

function boundedBodyPreview(body: string, limit = 220) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, limit - 1).trimEnd()}...`;
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
