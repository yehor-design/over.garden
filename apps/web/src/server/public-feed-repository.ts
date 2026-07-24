import "server-only";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type { Database, PlantObjectKind } from "@/db/schema";
import {
  publicJournalEntryPath,
  publicLineageObjectPath,
  publicProfilePath,
} from "@/lib/garden/public-paths";
import { isCoarseRegionCode } from "@/lib/garden/regions";
import type { PublicLocale } from "@/lib/public-localization";
import { getPublicDerivativeUrl } from "@/lib/storage";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

export const PUBLIC_FEED_PAGE_SIZE = 8;
const MAX_PUBLIC_FEED_PAGE_SIZE = 20;
const MAX_PUBLIC_FEED_MEDIA_PER_ENTRY = 3;
const MAX_PUBLIC_FEED_EXCERPT_LENGTH = 320;
const PUBLIC_FEED_CURSOR_VERSION = 1 as const;

export type PublicFeedKind = "all" | PlantObjectKind;

export interface PublicFeedCursor {
  version: typeof PUBLIC_FEED_CURSOR_VERSION;
  publishedAt: string;
  id: string;
}

export interface PublicFeedRequest {
  cursor: PublicFeedCursor | null;
  kind: PublicFeedKind;
  topic: string | null;
}

export interface PublicFeedMedia {
  id: string;
  publicUrl: string;
  focalX: number;
  focalY: number;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
}

export interface PublicFeedTopic {
  slug: string;
  label: string;
}

export interface TrustedPublicFeedTopic extends PublicFeedTopic {
  entryCount: number;
}

export interface PublicFeedEntry {
  id: string;
  title: string;
  excerpt: string;
  entryDate: Date | string;
  publishedAt: Date | string;
  publicPath: string;
  object: {
    id: string;
    displayName: string;
    kind: PlantObjectKind;
    publicPath: string;
    safeRegionCode: string | null;
  };
  author: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    profilePath: string;
  } | null;
  media: PublicFeedMedia[];
  topics: PublicFeedTopic[];
}

export interface PublicFeedPage {
  entries: PublicFeedEntry[];
  nextCursor: string | null;
}

export interface PublicFeedEntryRow {
  entryId: string;
  title: string;
  body: string;
  entryDate: Date | string;
  publishedAt: Date | string;
  publicSlug: string;
  objectId: string;
  objectDisplayName: string;
  objectKind: string;
  objectLocationVisibility: string;
  objectCoarseRegionCode: string | null;
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
}

export interface PublicFeedMediaRow {
  id: string;
  entryId: string;
  derivativeKey: string;
  focalX: number | null;
  focalY: number | null;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
}

export interface PublicFeedTopicRow {
  entryId: string;
  slug: string;
  label: string;
}

export function normalizePublicFeedRequest(input: {
  cursor?: string | string[];
  kind?: string | string[];
  topic?: string | string[];
}): PublicFeedRequest {
  const cursorValue = firstValue(input.cursor);
  const kindValue = firstValue(input.kind)?.trim().toLocaleLowerCase("en");

  return {
    cursor: cursorValue ? decodePublicFeedCursor(cursorValue) : null,
    kind: isPublicFeedKind(kindValue) ? kindValue : "all",
    topic: normalizePublicFeedTopicSlug(firstValue(input.topic)),
  };
}

export function encodePublicFeedCursor(cursor: PublicFeedCursor): string {
  const normalized = validatePublicFeedCursor(cursor);
  if (!normalized) throw new Error("Invalid public feed cursor.");

  return Buffer.from(JSON.stringify(normalized), "utf8").toString("base64url");
}

export function decodePublicFeedCursor(value: string): PublicFeedCursor | null {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    return validatePublicFeedCursor(decoded);
  } catch {
    return null;
  }
}

export async function listPublicFeedPage(
  input: PublicFeedRequest & { pageSize?: number },
  locale: PublicLocale,
  executor: QueryExecutor = db,
): Promise<PublicFeedPage> {
  const pageSize = normalizePageSize(input.pageSize);
  const rows = await buildPublicFeedEntriesQuery(executor, {
    ...input,
    pageSize,
  }).execute();
  const visibleRows = rows.slice(0, pageSize);
  const entryIds = visibleRows.map((row) => row.entryId);

  const [mediaRows, topicRows] =
    entryIds.length === 0
      ? [[], []]
      : await Promise.all([
          buildPublicFeedMediaQuery(executor, entryIds).execute(),
          buildPublicFeedTopicsForEntriesQuery(executor, entryIds).execute(),
        ]);

  return serializePublicFeedPage({
    rows,
    mediaRows,
    topicRows,
    locale,
    pageSize,
  });
}

export async function listTrustedPublicFeedTopics(
  executor: QueryExecutor = db,
  limit = 6,
): Promise<TrustedPublicFeedTopic[]> {
  const rows = await buildTrustedPublicFeedTopicsQuery(
    executor,
    normalizeTopicLimit(limit),
  ).execute();

  return rows.map((row) => ({
    slug: row.slug,
    label: row.label,
    entryCount: Number(row.entryCount ?? 0),
  }));
}

export function buildPublicFeedEntriesQuery(
  executor: QueryExecutor,
  input: PublicFeedRequest & { pageSize: number },
) {
  let query = executor
    .selectFrom("journal_entries")
    .innerJoin("plant_objects", (join) =>
      join
        .onRef("plant_objects.id", "=", "journal_entries.plant_object_id")
        .onRef(
          "plant_objects.owner_user_id",
          "=",
          "journal_entries.owner_user_id",
        ),
    )
    .leftJoin("user_handle_registry", (join) =>
      join
        .onRef(
          "user_handle_registry.user_id",
          "=",
          "journal_entries.owner_user_id",
        )
        .on("user_handle_registry.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles", (join) =>
      join
        .onRef(
          "user_public_profiles.user_id",
          "=",
          "user_handle_registry.user_id",
        )
        .onRef(
          "user_public_profiles.normalized_handle",
          "=",
          "user_handle_registry.normalized_handle",
        )
        .on("user_public_profiles.profile_visibility", "=", "public")
        .on("user_public_profiles.profile_lifecycle_state", "=", "active")
        .on("user_public_profiles.removed_at", "is", null),
    )
    .select([
      "journal_entries.id as entryId",
      "journal_entries.title as title",
      "journal_entries.body as body",
      "journal_entries.entry_date as entryDate",
      "journal_entries.published_at as publishedAt",
      "journal_entries.public_slug as publicSlug",
      "plant_objects.id as objectId",
      "plant_objects.display_name as objectDisplayName",
      "plant_objects.object_kind as objectKind",
      "plant_objects.location_visibility as objectLocationVisibility",
      "plant_objects.coarse_region_code as objectCoarseRegionCode",
      "user_public_profiles.handle as authorHandle",
      "user_public_profiles.display_name as authorDisplayName",
      "user_public_profiles.avatar_url as authorAvatarUrl",
    ])
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .$narrowType<{
      publishedAt: Date;
      publicSlug: string;
      objectId: string;
    }>();

  if (input.kind !== "all") {
    query = query.where("plant_objects.object_kind", "=", input.kind);
  }

  if (input.topic) {
    const topic = input.topic;
    query = query.where(({ exists, selectFrom }) =>
      exists(
        selectFrom("journal_entry_topic_signals")
          .innerJoin(
            "journal_topics",
            "journal_topics.id",
            "journal_entry_topic_signals.topic_id",
          )
          .select(sql<number>`1`.as("membership"))
          .whereRef(
            "journal_entry_topic_signals.journal_entry_id",
            "=",
            "journal_entries.id",
          )
          .where("journal_topics.slug", "=", topic)
          .where("journal_topics.trust_state", "=", "curated")
          .where("journal_entry_topic_signals.review_state", "=", "accepted")
          .where(
            "journal_entry_topic_signals.public_membership_state",
            "=",
            "eligible",
          ),
      ),
    );
  }

  if (input.cursor) {
    const cursor = input.cursor;
    const cursorPublishedAt = new Date(cursor.publishedAt);
    query = query.where((eb) =>
      eb.or([
        eb("journal_entries.published_at", "<", cursorPublishedAt),
        eb.and([
          eb("journal_entries.published_at", "=", cursorPublishedAt),
          eb("journal_entries.id", ">", cursor.id),
        ]),
      ]),
    );
  }

  return query
    .orderBy("journal_entries.published_at", "desc")
    .orderBy("journal_entries.id", "asc")
    .limit(normalizePageSize(input.pageSize) + 1);
}

export function buildPublicFeedMediaQuery(
  executor: QueryExecutor,
  entryIds: readonly string[],
) {
  const rankedMedia = executor
    .selectFrom("media_assets")
    .innerJoin(
      "journal_entries",
      "journal_entries.id",
      "media_assets.journal_entry_id",
    )
    .select([
      "media_assets.id as media_id",
      "media_assets.journal_entry_id as entry_id",
      "media_assets.derivative_key as derivative_key",
      "media_assets.focal_x as focal_x",
      "media_assets.focal_y as focal_y",
      "media_assets.intrinsic_width as intrinsic_width",
      "media_assets.intrinsic_height as intrinsic_height",
      sql<number>`row_number() over (
        partition by ${sql.ref("media_assets.journal_entry_id")}
        order by
          case
            when ${sql.ref("media_assets.id")} = ${sql.ref("journal_entries.cover_media_asset_id")}
              then 0
            else 1
          end asc,
          case
            when ${sql.ref("media_assets.usage_role")} = 'inline' then 0
            else 1
          end asc,
          ${sql.ref("media_assets.document_position")} asc nulls last,
          ${sql.ref("media_assets.id")} asc
      )`.as("media_rank"),
    ])
    .whereRef(
      "media_assets.owner_user_id",
      "=",
      "journal_entries.owner_user_id",
    )
    .where("journal_entries.id", "in", [...entryIds])
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
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
    .$narrowType<{
      entry_id: string;
      derivative_key: string;
    }>()
    .as("ranked_media");

  return executor
    .selectFrom(rankedMedia)
    .select([
      "ranked_media.media_id as id",
      "ranked_media.entry_id as entryId",
      "ranked_media.derivative_key as derivativeKey",
      "ranked_media.focal_x as focalX",
      "ranked_media.focal_y as focalY",
      "ranked_media.intrinsic_width as intrinsicWidth",
      "ranked_media.intrinsic_height as intrinsicHeight",
    ])
    .where("ranked_media.media_rank", "<=", MAX_PUBLIC_FEED_MEDIA_PER_ENTRY)
    .orderBy("ranked_media.entry_id", "asc")
    .orderBy("ranked_media.media_rank", "asc");
}

export function buildPublicFeedTopicsForEntriesQuery(
  executor: QueryExecutor,
  entryIds: readonly string[],
) {
  return executor
    .selectFrom("journal_entry_topic_signals")
    .innerJoin(
      "journal_topics",
      "journal_topics.id",
      "journal_entry_topic_signals.topic_id",
    )
    .innerJoin(
      "journal_entries",
      "journal_entries.id",
      "journal_entry_topic_signals.journal_entry_id",
    )
    .select([
      "journal_entry_topic_signals.journal_entry_id as entryId",
      "journal_topics.slug as slug",
      "journal_topics.label as label",
    ])
    .where("journal_entry_topic_signals.journal_entry_id", "in", [...entryIds])
    .where("journal_topics.trust_state", "=", "curated")
    .where("journal_entry_topic_signals.review_state", "=", "accepted")
    .where(
      "journal_entry_topic_signals.public_membership_state",
      "=",
      "eligible",
    )
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .orderBy("journal_entry_topic_signals.journal_entry_id", "asc")
    .orderBy("journal_topics.label", "asc");
}

export function buildTrustedPublicFeedTopicsQuery(
  executor: QueryExecutor,
  limit: number,
) {
  return executor
    .selectFrom("journal_topics")
    .leftJoin("journal_entry_topic_signals", (join) =>
      join
        .onRef("journal_entry_topic_signals.topic_id", "=", "journal_topics.id")
        .on("journal_entry_topic_signals.review_state", "=", "accepted")
        .on(
          "journal_entry_topic_signals.public_membership_state",
          "=",
          "eligible",
        ),
    )
    .leftJoin("journal_entries", (join) =>
      join
        .onRef(
          "journal_entries.id",
          "=",
          "journal_entry_topic_signals.journal_entry_id",
        )
        .on("journal_entries.visibility", "=", "public")
        .on("journal_entries.lifecycle_state", "=", "active")
        .on("journal_entries.entry_scope", "=", "object")
        .on("journal_entries.public_gone_at", "is", null)
        .on("journal_entries.public_slug", "is not", null)
        .on("journal_entries.published_at", "is not", null),
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
      "journal_topics.slug as slug",
      "journal_topics.label as label",
      sql<number>`count(distinct case when ${sql.ref("plant_objects.id")} is not null then ${sql.ref("journal_entries.id")} end)`.as(
        "entryCount",
      ),
    ])
    .where("journal_topics.trust_state", "=", "curated")
    .groupBy([
      "journal_topics.id",
      "journal_topics.slug",
      "journal_topics.label",
    ])
    .orderBy("entryCount", "desc")
    .orderBy("journal_topics.label", "asc")
    .limit(normalizeTopicLimit(limit));
}

export function serializePublicFeedPage(input: {
  rows: PublicFeedEntryRow[];
  mediaRows: PublicFeedMediaRow[];
  topicRows: PublicFeedTopicRow[];
  locale: PublicLocale;
  pageSize: number;
  publicMediaUrl?: (derivativeKey: string) => string;
}): PublicFeedPage {
  const pageSize = normalizePageSize(input.pageSize);
  const visibleRows = input.rows.slice(0, pageSize);
  const mediaByEntry = Object.groupBy(input.mediaRows, (row) => row.entryId);
  const topicsByEntry = Object.groupBy(input.topicRows, (row) => row.entryId);
  const publicMediaUrl = input.publicMediaUrl ?? getPublicDerivativeUrl;

  const entries = visibleRows.map((row): PublicFeedEntry => {
    const kind = normalizeObjectKind(row.objectKind);

    return {
      id: row.entryId,
      title: row.title,
      excerpt: buildPublicFeedExcerpt(row.body),
      entryDate: row.entryDate,
      publishedAt: row.publishedAt,
      publicPath: publicJournalEntryPath(row.publicSlug),
      object: {
        id: row.objectId,
        displayName: row.objectDisplayName,
        kind,
        publicPath: publicLineageObjectPath(row.objectId),
        safeRegionCode:
          row.objectLocationVisibility === "region" &&
          isCoarseRegionCode(row.objectCoarseRegionCode)
            ? row.objectCoarseRegionCode
            : null,
      },
      author: row.authorHandle
        ? {
            handle: row.authorHandle,
            displayName: row.authorDisplayName ?? `@${row.authorHandle}`,
            avatarUrl: row.authorAvatarUrl,
            profilePath: publicProfilePath(input.locale, row.authorHandle),
          }
        : null,
      media: (mediaByEntry[row.entryId] ?? [])
        .slice(0, MAX_PUBLIC_FEED_MEDIA_PER_ENTRY)
        .map((media) => ({
          id: media.id,
          publicUrl: publicMediaUrl(media.derivativeKey),
          focalX: Number(media.focalX ?? 0.5),
          focalY: Number(media.focalY ?? 0.5),
          intrinsicWidth: media.intrinsicWidth ?? null,
          intrinsicHeight: media.intrinsicHeight ?? null,
        })),
      topics: (topicsByEntry[row.entryId] ?? []).map((topic) => ({
        slug: topic.slug,
        label: topic.label,
      })),
    };
  });

  const cursorRow = input.rows.length > pageSize ? visibleRows.at(-1) : null;

  return {
    entries,
    nextCursor: cursorRow
      ? encodePublicFeedCursor({
          version: PUBLIC_FEED_CURSOR_VERSION,
          publishedAt: toIsoString(cursorRow.publishedAt),
          id: cursorRow.entryId,
        })
      : null,
  };
}

function buildPublicFeedExcerpt(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_PUBLIC_FEED_EXCERPT_LENGTH) return normalized;

  return `${normalized.slice(0, MAX_PUBLIC_FEED_EXCERPT_LENGTH - 3).trimEnd()}...`;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isPublicFeedKind(value: string | undefined): value is PublicFeedKind {
  return (
    value === "all" ||
    value === "plant" ||
    value === "animal"
  );
}

function normalizeObjectKind(value: string): PlantObjectKind {
  if (value === "plant" || value === "animal") {
    return value;
  }

  throw new Error(`Unsupported public feed object kind: ${value}`);
}

function normalizePublicFeedTopicSlug(value: string | undefined) {
  const normalized = value?.trim().toLocaleLowerCase("en") ?? "";
  return /^[a-z0-9][a-z0-9-]{1,63}$/.test(normalized) ? normalized : null;
}

function validatePublicFeedCursor(value: unknown): PublicFeedCursor | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  if (candidate.version !== PUBLIC_FEED_CURSOR_VERSION) return null;
  if (
    typeof candidate.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate.id,
    )
  ) {
    return null;
  }
  if (typeof candidate.publishedAt !== "string") return null;

  const timestamp = new Date(candidate.publishedAt);
  if (
    Number.isNaN(timestamp.getTime()) ||
    timestamp.toISOString() !== candidate.publishedAt
  ) {
    return null;
  }

  return {
    version: PUBLIC_FEED_CURSOR_VERSION,
    publishedAt: candidate.publishedAt,
    id: candidate.id,
  };
}

function normalizePageSize(value: number | undefined) {
  if (!Number.isFinite(value)) return PUBLIC_FEED_PAGE_SIZE;
  return Math.min(
    Math.max(Math.trunc(value ?? PUBLIC_FEED_PAGE_SIZE), 1),
    MAX_PUBLIC_FEED_PAGE_SIZE,
  );
}

function normalizeTopicLimit(value: number) {
  if (!Number.isFinite(value)) return 6;
  return Math.min(Math.max(Math.trunc(value), 1), 12);
}

function toIsoString(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
