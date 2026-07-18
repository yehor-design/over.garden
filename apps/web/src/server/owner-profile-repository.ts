import "server-only";

import type { Kysely, Transaction } from "kysely";

import { db } from "@/db";
import type { Database, UserPublicProfile } from "@/db/schema";
import {
  normalizeCoarseRegionCode,
  type CoarseRegionCode,
} from "@/lib/garden/regions";
import type { PublicLocale } from "@/lib/public-localization";
import {
  evaluatePublicIdentity,
  IDENTITY_POLICY_VERSION,
} from "@/server/identity-policy";
import {
  ensureUserPublicProfile,
  buildPublicProfileFollowerCountQuery,
  buildPublicProfileFollowingCountQuery,
  getPublicProfileEvidencePreviewByUserId,
  type PublicProfileEvidencePage,
  type PublicProfileLanguage,
} from "@/server/public-profile-repository";
import type { RequestScope } from "@/server/request-scope";
import { getPublicDerivativeUrl } from "@/lib/storage";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const BIO_MAX_LENGTH = 600;
const PROFILE_LANGUAGE_LIMIT = 4;
const PROFILE_LANGUAGES = new Set<PublicProfileLanguage>([
  "uk",
  "bg",
  "ru",
  "en",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_AVATAR_OPTION_LIMIT = 24;

export type OwnerProfileValidationError =
  | "avatar"
  | "display_name"
  | "display_name_unavailable"
  | "bio"
  | "languages"
  | "region"
  | "profile_visibility"
  | "relationship_visibility";

export interface OwnerPublicProfileInput {
  avatarMediaAssetId: string | null;
  displayName: string | null;
  bio: string | null;
  languages: readonly string[];
  locationVisibility: "hidden" | "region" | string;
  coarseRegionCode: string | null;
  profileVisibility: "public" | "private" | string;
  relationshipVisibility: "counts" | "hidden" | string;
}

export interface NormalizedOwnerPublicProfileInput {
  avatarMediaAssetId: string | null;
  displayName: string | null;
  bio: string | null;
  languages: PublicProfileLanguage[];
  locationVisibility: "hidden" | "region";
  coarseRegionCode: CoarseRegionCode | null;
  profileVisibility: "public" | "private";
  relationshipVisibility: "counts" | "hidden";
}

export interface OwnerPublicProfileEditor {
  handle: string;
  avatarMediaAssetId: string | null;
  displayName: string | null;
  bio: string | null;
  languages: PublicProfileLanguage[];
  locationVisibility: "hidden" | "region";
  coarseRegionCode: CoarseRegionCode | null;
  profileVisibility: "public" | "private";
  relationshipVisibility: "counts" | "hidden";
}

export interface BlockedProfileSummary {
  blockId: string;
  handle: string;
  displayName: string | null;
}

export interface OwnerProfileAvatarOption {
  mediaAssetId: string;
  publicUrl: string;
  alt: string;
}

export interface OwnerProfileWorkspace {
  editor: OwnerPublicProfileEditor;
  handleRename: {
    currentHandle: string;
    nextEligibleAt: Date | string | null;
    canRename: boolean;
  };
  preview: PublicProfileEvidencePage;
  avatarOptions: OwnerProfileAvatarOption[];
  relationshipCounts: { followers: number; following: number };
  blockedProfiles: BlockedProfileSummary[];
}

export type OwnerPublicProfileUpdateResult =
  | {
      status: "updated" | "unchanged";
      profile: UserPublicProfile;
    }
  | {
      status: OwnerProfileValidationError;
      profile: UserPublicProfile;
    };

export function normalizeOwnerPublicProfileInput(
  input: OwnerPublicProfileInput,
):
  | { ok: true; value: NormalizedOwnerPublicProfileInput }
  | { ok: false; error: OwnerProfileValidationError } {
  return normalizeOwnerPublicProfileFields(input, true);
}

function normalizeOwnerPublicProfileFields(
  input: OwnerPublicProfileInput,
  moderateDisplayName: boolean,
):
  | { ok: true; value: NormalizedOwnerPublicProfileInput }
  | { ok: false; error: OwnerProfileValidationError } {
  const avatarMediaAssetId = input.avatarMediaAssetId?.trim() || null;
  if (avatarMediaAssetId && !UUID_PATTERN.test(avatarMediaAssetId)) {
    return { ok: false, error: "avatar" };
  }

  let displayName = input.displayName?.trim() || null;
  if (displayName && moderateDisplayName) {
    const moderation = evaluatePublicIdentity({
      surface: "display_name",
      value: displayName,
    });
    if (!moderation.ok) {
      return { ok: false, error: "display_name_unavailable" };
    }
    displayName = moderation.value;
  }

  const bio = input.bio?.trim() || null;
  if (bio && bio.length > BIO_MAX_LENGTH) {
    return { ok: false, error: "bio" };
  }

  const languages = [...new Set(input.languages.map((value) => value.trim()))];
  if (
    languages.length > PROFILE_LANGUAGE_LIMIT ||
    languages.some(
      (language) => !PROFILE_LANGUAGES.has(language as PublicProfileLanguage),
    )
  ) {
    return { ok: false, error: "languages" };
  }

  if (
    input.locationVisibility !== "hidden" &&
    input.locationVisibility !== "region"
  ) {
    return { ok: false, error: "region" };
  }
  const coarseRegionCode =
    input.locationVisibility === "region"
      ? normalizeCoarseRegionCode(input.coarseRegionCode)
      : null;
  if (input.locationVisibility === "region" && !coarseRegionCode) {
    return { ok: false, error: "region" };
  }

  if (
    input.profileVisibility !== "public" &&
    input.profileVisibility !== "private"
  ) {
    return { ok: false, error: "profile_visibility" };
  }
  if (
    input.relationshipVisibility !== "counts" &&
    input.relationshipVisibility !== "hidden"
  ) {
    return { ok: false, error: "relationship_visibility" };
  }

  return {
    ok: true,
    value: {
      avatarMediaAssetId,
      displayName,
      bio,
      languages: languages as PublicProfileLanguage[],
      locationVisibility: input.locationVisibility,
      coarseRegionCode,
      profileVisibility: input.profileVisibility,
      relationshipVisibility: input.relationshipVisibility,
    },
  };
}

export async function getOwnerProfileWorkspace(
  scope: RequestScope,
  locale: PublicLocale,
  executor: QueryExecutor = db,
): Promise<OwnerProfileWorkspace> {
  const profile = await ensureUserPublicProfile(scope, executor);
  const [
    preview,
    blockedProfiles,
    avatarRows,
    followerRow,
    followingRow,
    handleClaim,
  ] = await Promise.all([
    getPublicProfileEvidencePreviewByUserId(scope.userId, locale, executor),
    buildBlockedProfileSummariesQuery(executor, scope).execute(),
    buildOwnerAvatarOptionsQuery(executor, scope).execute(),
    buildPublicProfileFollowerCountQuery(
      executor,
      scope.userId,
    ).executeTakeFirst(),
    buildPublicProfileFollowingCountQuery(
      executor,
      scope.userId,
    ).executeTakeFirst(),
    buildOwnerCurrentHandleClaimQuery(executor, scope).executeTakeFirst(),
  ]);

  if (!preview || !handleClaim) {
    throw new Error("Owner public profile preview is unavailable.");
  }

  const nextEligibleAt = finiteDateOrNull(handleClaim.nextEligibleAt);

  return {
    editor: serializeOwnerPublicProfileEditor({
      handle: profile.handle,
      avatarMediaAssetId: profile.avatar_media_asset_id,
      displayName: profile.display_name,
      bio: profile.bio,
      languages: profile.languages,
      locationVisibility: profile.location_visibility,
      coarseRegionCode: profile.coarse_region_code,
      profileVisibility: profile.profile_visibility,
      relationshipVisibility: profile.relationship_visibility,
    }),
    handleRename: {
      currentHandle: profile.handle,
      nextEligibleAt,
      canRename:
        nextEligibleAt === null || nextEligibleAt.getTime() <= Date.now(),
    },
    preview,
    avatarOptions: avatarRows.map((row) => ({
      mediaAssetId: row.mediaAssetId,
      publicUrl: getPublicDerivativeUrl(row.derivativeKey),
      alt: row.altText?.trim() || "Profile photo",
    })),
    relationshipCounts: {
      followers: numericCount(followerRow?.count),
      following: numericCount(followingRow?.count),
    },
    blockedProfiles,
  };
}

function finiteDateOrNull(value: Date | string): Date | null {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function updateOwnerPublicProfile(
  scope: RequestScope,
  input: OwnerPublicProfileInput,
  executor: QueryExecutor = db,
): Promise<OwnerPublicProfileUpdateResult> {
  const current = await ensureUserPublicProfile(scope, executor);
  const normalized = normalizeOwnerPublicProfileInput(input);
  if (!normalized.ok) {
    return { status: normalized.error, profile: current };
  }

  const value = normalized.value;
  if (ownerProfileMatches(current, value)) {
    return { status: "unchanged", profile: current };
  }

  const updated = await buildUpdateOwnerPublicProfileQuery(
    executor,
    scope,
    value,
  ).executeTakeFirst();
  return updated
    ? { status: "updated", profile: updated }
    : {
        status: value.avatarMediaAssetId ? "avatar" : "unchanged",
        profile: current,
      };
}

export function buildOwnerPublicProfileByUserIdQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("user_public_profiles")
    .select([
      "handle",
      "avatar_media_asset_id as avatarMediaAssetId",
      "display_name as displayName",
      "bio",
      "languages",
      "location_visibility as locationVisibility",
      "coarse_region_code as coarseRegionCode",
      "profile_visibility as profileVisibility",
      "relationship_visibility as relationshipVisibility",
    ])
    .where("user_id", "=", scope.userId)
    .where("profile_lifecycle_state", "=", "active")
    .where("removed_at", "is", null);
}

export function buildOwnerCurrentHandleClaimQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("user_handle_registry")
    .select(["normalized_handle as handle", "next_rename_at as nextEligibleAt"])
    .where("user_id", "=", scope.userId)
    .where("lifecycle_state", "=", "current")
    .limit(1);
}

export function buildUpdateOwnerPublicProfileQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: NormalizedOwnerPublicProfileInput,
) {
  return executor
    .updateTable("user_public_profiles")
    .set({
      avatar_media_asset_id: input.avatarMediaAssetId,
      display_name: input.displayName,
      display_name_policy_version: input.displayName
        ? IDENTITY_POLICY_VERSION
        : null,
      bio: input.bio,
      languages: input.languages,
      location_visibility: input.locationVisibility,
      coarse_region_code: input.coarseRegionCode,
      profile_visibility: input.profileVisibility,
      relationship_visibility: input.relationshipVisibility,
      updated_at: new Date(),
    })
    .where("user_id", "=", scope.userId)
    .where("profile_lifecycle_state", "=", "active")
    .where("removed_at", "is", null)
    .where((eb) =>
      input.avatarMediaAssetId
        ? eb.exists(
            eb
              .selectFrom("media_assets")
              .select("id")
              .where("id", "=", input.avatarMediaAssetId)
              .where("owner_user_id", "=", scope.userId)
              .where("status", "=", "processed")
              .where("derivative_key", "is not", null),
          )
        : eb.val(true),
    )
    .returningAll();
}

export function buildOwnerAvatarOptionsQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("media_assets")
    .select([
      "id as mediaAssetId",
      "derivative_key as derivativeKey",
      "alt_text as altText",
    ])
    .where("owner_user_id", "=", scope.userId)
    .where("status", "=", "processed")
    .where("derivative_key", "is not", null)
    .orderBy("updated_at", "desc")
    .orderBy("id", "asc")
    .limit(OWNER_AVATAR_OPTION_LIMIT)
    .$narrowType<{ derivativeKey: string }>();
}

export function buildBlockedProfileSummariesQuery(
  executor: QueryExecutor,
  scope: RequestScope,
) {
  return executor
    .selectFrom("profile_blocks")
    .innerJoin("user_public_profiles", (join) =>
      join.onRef(
        "user_public_profiles.user_id",
        "=",
        "profile_blocks.blocked_user_id",
      ),
    )
    .select([
      "profile_blocks.id as blockId",
      "user_public_profiles.handle",
      "user_public_profiles.display_name as displayName",
    ])
    .where("profile_blocks.blocker_user_id", "=", scope.userId)
    .where("profile_blocks.block_state", "=", "active")
    .orderBy("profile_blocks.updated_at", "desc")
    .orderBy("user_public_profiles.handle", "asc");
}

export function serializeOwnerPublicProfileEditor(input: {
  handle: string;
  avatarMediaAssetId: string | null;
  displayName: string | null;
  bio: string | null;
  languages: readonly string[];
  locationVisibility: string;
  coarseRegionCode: string | null;
  profileVisibility: string;
  relationshipVisibility: string;
}): OwnerPublicProfileEditor {
  const normalized = normalizeOwnerPublicProfileFields(
    {
      avatarMediaAssetId: input.avatarMediaAssetId,
      displayName: input.displayName,
      bio: input.bio,
      languages: input.languages,
      locationVisibility: input.locationVisibility,
      coarseRegionCode: input.coarseRegionCode,
      profileVisibility: input.profileVisibility,
      relationshipVisibility: input.relationshipVisibility,
    },
    false,
  );
  if (!normalized.ok) {
    throw new Error("Stored owner public profile is invalid.");
  }

  const value = normalized.value;
  return {
    handle: input.handle,
    avatarMediaAssetId: value.avatarMediaAssetId,
    displayName: value.displayName,
    bio: value.bio,
    languages: value.languages,
    locationVisibility: value.locationVisibility,
    coarseRegionCode: value.coarseRegionCode,
    profileVisibility: value.profileVisibility,
    relationshipVisibility: value.relationshipVisibility,
  };
}

function ownerProfileMatches(
  profile: UserPublicProfile,
  input: NormalizedOwnerPublicProfileInput,
) {
  return (
    profile.avatar_media_asset_id === input.avatarMediaAssetId &&
    profile.display_name === input.displayName &&
    profile.bio === input.bio &&
    JSON.stringify(profile.languages) === JSON.stringify(input.languages) &&
    profile.location_visibility === input.locationVisibility &&
    profile.coarse_region_code === input.coarseRegionCode &&
    profile.profile_visibility === input.profileVisibility &&
    profile.relationship_visibility === input.relationshipVisibility
  );
}

function numericCount(value: string | number | bigint | null | undefined) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}
