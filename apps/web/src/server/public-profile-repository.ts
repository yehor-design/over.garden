import "server-only";

import { createHash } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  Database,
  NewUserPublicProfile,
  UserPublicProfile,
} from "@/db/schema";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  publicJournalEntryPath,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const HANDLE_MIN_LENGTH = 3;
const HANDLE_MAX_LENGTH = 30;
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_]{2,29}$/;
const DEFAULT_HANDLE_HASH_LENGTH = 10;
const DEFAULT_HANDLE_PREFIX = "gardener";
const MAX_PROFILE_LINKS = 5;

const RESERVED_PUBLIC_HANDLES = new Set([
  "about",
  "account",
  "admin",
  "api",
  "auth",
  "blog",
  "catalog",
  "erasure",
  "garden",
  "guide",
  "guides",
  "health",
  "help",
  "home",
  "join",
  "lineage",
  "login",
  "logout",
  "market",
  "markets",
  "me",
  "moderator",
  "overgarden",
  "privacy",
  "profile",
  "profiles",
  "robots",
  "root",
  "settings",
  "signup",
  "sitemap",
  "support",
  "user",
  "users",
  "variety",
  "uk",
  "bg",
  "ru",
]);

const BLOCKED_HANDLE_FRAGMENTS = ["hitler", "nazi", "rape", "terror"] as const;

export type PublicHandleValidationError =
  | "empty"
  | "format"
  | "reserved"
  | "blocked";

export type PublicHandleUpdateStatus =
  | "updated"
  | "unchanged"
  | "taken"
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

export interface PublicHandleMentionTarget {
  handle: string;
  mention: `@${string}`;
  profilePath: string;
}

export interface UpdateUserPublicHandleResult {
  status: PublicHandleUpdateStatus;
  profile: Pick<UserPublicProfile, "handle" | "display_name" | "avatar_url">;
}

interface PublicProfileInternalRow {
  userId: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface PublicProfileEntrySummaryRow {
  publicEntryCount: string | number | bigint;
  publicObjectCount: string | number | bigint;
}

interface PublicProfileLineageSummaryRow {
  confirmedLineageEdgeCount: string | number | bigint;
}

interface PublicProfileLinkRow {
  publicSlug: string | null;
  entryDate: Date | string;
}

export async function ensureUserPublicProfile(
  scope: RequestScope,
  executor: QueryExecutor = db,
): Promise<UserPublicProfile> {
  const existing = await buildUserPublicProfileByUserIdQuery(
    executor,
    scope.userId,
  ).executeTakeFirst();

  if (existing) return existing;

  const baseHandle = defaultPublicHandleForUserId(scope.userId);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const handle = attempt === 0 ? baseHandle : `${baseHandle}_${attempt}`;

    try {
      const inserted = await buildInsertUserPublicProfileQuery(executor, {
        user_id: scope.userId,
        handle,
        normalized_handle: handle,
      }).executeTakeFirst();

      if (inserted) return inserted;

      const afterConflict = await buildUserPublicProfileByUserIdQuery(
        executor,
        scope.userId,
      ).executeTakeFirst();

      if (afterConflict) return afterConflict;
    } catch (error) {
      if (isPostgresUniqueViolation(error)) continue;
      throw error;
    }
  }

  throw new Error("Could not allocate a unique public handle.");
}

export async function updateUserPublicHandle(
  scope: RequestScope,
  rawHandle: string,
  executor: QueryExecutor = db,
): Promise<UpdateUserPublicHandleResult> {
  const validation = normalizePublicHandleInput(rawHandle);
  const currentProfile = await ensureUserPublicProfile(scope, executor);

  if (!validation.ok) {
    return {
      status: validation.error,
      profile: currentProfile,
    };
  }

  if (currentProfile.normalized_handle === validation.normalizedHandle) {
    return {
      status: "unchanged",
      profile: currentProfile,
    };
  }

  try {
    const updated = await buildUpdateUserPublicHandleQuery(executor, scope, {
      handle: validation.handle,
      normalizedHandle: validation.normalizedHandle,
    }).executeTakeFirst();

    return {
      status: updated ? "updated" : "taken",
      profile: updated ?? currentProfile,
    };
  } catch (error) {
    if (isPostgresUniqueViolation(error)) {
      return {
        status: "taken",
        profile: currentProfile,
      };
    }

    throw error;
  }
}

export async function getPublicProfilePageByHandle(
  rawHandle: string,
  executor: QueryExecutor = db,
): Promise<PublicProfilePage | null> {
  const validation = normalizePublicHandleInput(rawHandle);
  if (!validation.ok) return null;

  const profile = await buildPublicProfileByNormalizedHandleQuery(
    executor,
    validation.normalizedHandle,
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

export async function resolvePublicHandleMentionTarget(
  rawHandle: string,
  locale: PublicLocale = DEFAULT_PUBLIC_LOCALE,
  executor: QueryExecutor = db,
): Promise<PublicHandleMentionTarget | null> {
  const validation = normalizePublicHandleInput(rawHandle);
  if (!validation.ok) return null;

  const profile = await buildPublicProfileByNormalizedHandleQuery(
    executor,
    validation.normalizedHandle,
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
  const trimmed = rawHandle.trim();
  if (!trimmed) return { ok: false, error: "empty" };

  const withoutLeadingAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const normalized = withoutLeadingAt.normalize("NFKC").toLocaleLowerCase("en");

  if (
    normalized.length < HANDLE_MIN_LENGTH ||
    normalized.length > HANDLE_MAX_LENGTH ||
    normalized.includes("@") ||
    !HANDLE_PATTERN.test(normalized)
  ) {
    return { ok: false, error: "format" };
  }

  if (RESERVED_PUBLIC_HANDLES.has(normalized)) {
    return { ok: false, error: "reserved" };
  }

  if (
    BLOCKED_HANDLE_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  ) {
    return { ok: false, error: "blocked" };
  }

  return {
    ok: true,
    handle: normalized,
    normalizedHandle: normalized,
    mention: `@${normalized}`,
  };
}

export function defaultPublicHandleForUserId(userId: string) {
  const digest = createHash("sha256").update(userId).digest("hex");
  return `${DEFAULT_HANDLE_PREFIX}_${digest.slice(0, DEFAULT_HANDLE_HASH_LENGTH)}`;
}

export function serializePublicProfilePage(input: {
  profile: PublicProfileInternalRow;
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

export function buildUserPublicProfileByUserIdQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
    .selectFrom("user_public_profiles")
    .selectAll()
    .where("user_id", "=", userId);
}

export function buildInsertUserPublicProfileQuery(
  executor: QueryExecutor,
  profile: NewUserPublicProfile,
) {
  return executor
    .insertInto("user_public_profiles")
    .values(profile)
    .onConflict((oc) => oc.column("user_id").doNothing())
    .returningAll();
}

export function buildUpdateUserPublicHandleQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    handle: string;
    normalizedHandle: string;
  },
) {
  return executor
    .updateTable("user_public_profiles")
    .set({
      handle: input.handle,
      normalized_handle: input.normalizedHandle,
      updated_at: new Date(),
    })
    .where("user_id", "=", scope.userId)
    .returningAll();
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
    ])
    .where("normalized_handle", "=", normalizedHandle);
}

export function buildPublicProfileEntrySummaryQuery(
  executor: QueryExecutor,
  userId: string,
) {
  return executor
    .selectFrom("journal_entries")
    .select(({ fn }) => [
      fn.count<number>("journal_entries.id").as("publicEntryCount"),
      sql<number>`count(distinct ${sql.ref(
        "journal_entries.plant_object_id",
      )})`.as("publicObjectCount"),
    ])
    .where("journal_entries.owner_user_id", "=", userId)
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null);
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

function isPostgresUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
