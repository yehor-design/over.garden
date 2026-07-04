import "server-only";

import { createHash } from "node:crypto";

import { type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  Database,
  EngagementBookmarkState,
  EngagementLikeState,
  EngagementTargetKind,
} from "@/db/schema";
import {
  publicJournalEntryPath,
  publicLineageObjectPath,
  publicVarietyPath,
} from "@/lib/garden/public-paths";
import { SELECTABLE_CATALOG_STATUSES } from "@/server/catalog-repository";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const MAX_COMMENT_BODY_LENGTH = 600;
const MAX_COMMENT_READBACK = 50;
const MAX_BOOKMARK_READBACK = 50;
const ANONYMOUS_LIKE_WINDOW_MS = 60 * 60 * 1000;
const ANONYMOUS_LIKE_WINDOW_LIMIT = 20;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const JOURNAL_SLUG_PATTERN = /^[\p{Letter}\p{Number}-]+$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_COMMENT_PATTERN =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\d\s().-]{7,}\d)|https?:\/\/|www\.|(?:^|\s)@[A-Za-z0-9_]{2,}|latitude|longitude|gps|coordinates?|координат|invite|token)/i;

export interface EngagementTarget {
  kind: EngagementTargetKind;
  ref: string;
}

export interface PublicEngagementTarget {
  kind: EngagementTargetKind;
  ref: string;
  label: string;
  href: string;
}

export interface PublicEngagementComment {
  key: string;
  replyToken: string;
  body: string;
  authorLabel: string;
  authorHandle: string | null;
  parentReplyToken: string | null;
  createdAt: Date | string;
}

export interface PublicEngagementSummary {
  target: EngagementTarget;
  activeLikeCount: number;
  comments: PublicEngagementComment[];
}

export interface EngagementBookmarkShelfItem {
  key: string;
  target: PublicEngagementTarget;
  addedAt: Date | string;
  updatedAt: Date | string;
}

interface EngagementCommentRow {
  commentId: string;
  parentCommentId: string | null;
  body: string;
  createdAt: Date | string;
  authorHandle: string | null;
  authorDisplayName: string | null;
}

interface EngagementLikeRow {
  id: string;
  like_state: string;
  toggle_window_started_at: Date | string;
  toggle_count: number;
}

export async function getEngagementSummary(
  target: EngagementTarget,
  executor: QueryExecutor = db,
): Promise<PublicEngagementSummary> {
  const normalizedTarget = normalizeEngagementTarget(target.kind, target.ref);
  await ensureEngagementTargetIsPublic(normalizedTarget, executor);

  const [comments, activeLikeCount] = await Promise.all([
    listEngagementComments(normalizedTarget, executor),
    countActiveEngagementLikes(normalizedTarget, executor),
  ]);

  return {
    target: normalizedTarget,
    activeLikeCount,
    comments,
  };
}

export async function addEngagementComment(
  scope: RequestScope,
  input: {
    target: EngagementTarget;
    body: string;
    parentCommentId?: string | null;
  },
  executor: QueryExecutor = db,
): Promise<PublicEngagementComment> {
  const target = normalizeEngagementTarget(input.target.kind, input.target.ref);
  const body = normalizeCommentBody(input.body);
  const parentCommentId = normalizeOptionalCommentId(input.parentCommentId);

  await ensureEngagementTargetIsPublic(target, executor);
  if (parentCommentId) {
    const parent = await executor
      .selectFrom("engagement_comments")
      .select("id")
      .where("id", "=", parentCommentId)
      .where("target_kind", "=", target.kind)
      .where("target_ref", "=", target.ref)
      .where("comment_state", "=", "active")
      .executeTakeFirst();

    if (!parent) {
      throw new Error("Comment reply target is not available.");
    }
  }

  const row = await buildInsertEngagementCommentQuery(executor, scope, {
    target,
    body,
    parentCommentId,
  }).executeTakeFirstOrThrow();

  return serializeCommentRow({
    commentId: row.id,
    parentCommentId: row.parent_comment_id,
    body: row.body,
    createdAt: row.created_at,
    authorHandle: null,
    authorDisplayName: null,
  });
}

export async function toggleEngagementBookmark(
  scope: RequestScope,
  input: { target: EngagementTarget },
  executor: QueryExecutor = db,
) {
  const target = normalizeEngagementTarget(input.target.kind, input.target.ref);

  await ensureEngagementTargetIsPublic(target, executor);
  const existing = await buildGetEngagementBookmarkQuery(
    executor,
    scope,
    target,
  ).executeTakeFirst();
  const nextState: EngagementBookmarkState =
    existing?.bookmark_state === "active" ? "removed" : "active";

  const row = await buildUpsertEngagementBookmarkQuery(executor, scope, {
    target,
    bookmarkState: nextState,
  }).executeTakeFirstOrThrow();

  return {
    active: row.bookmark_state === "active",
    bookmark: row,
  };
}

export async function listEngagementBookmarks(
  scope: RequestScope,
  executor: QueryExecutor = db,
): Promise<EngagementBookmarkShelfItem[]> {
  const rows = await buildListEngagementBookmarksQuery(
    executor,
    scope,
    MAX_BOOKMARK_READBACK,
  ).execute();
  const items: EngagementBookmarkShelfItem[] = [];

  for (const row of rows) {
    const target = normalizeEngagementTarget(row.targetKind, row.targetRef);
    const publicTarget = await findPublicEngagementTarget(target, executor);
    if (!publicTarget) continue;

    items.push({
      key: stableEngagementKey("bookmark", row.bookmarkId),
      target: publicTarget,
      addedAt: row.addedAt,
      updatedAt: row.updatedAt,
    });
  }

  return items;
}

export async function toggleAnonymousEngagementLike(
  input: { target: EngagementTarget; anonymousToken: string; now?: Date },
  executor: QueryExecutor = db,
) {
  const target = normalizeEngagementTarget(input.target.kind, input.target.ref);
  const anonymousDeviceHash = hashAnonymousEngagementToken(
    input.anonymousToken,
  );
  const now = input.now ?? new Date();

  await ensureEngagementTargetIsPublic(target, executor);
  const existing = await buildGetAnonymousLikeQuery(
    executor,
    target,
    anonymousDeviceHash,
  ).executeTakeFirst();

  if (!existing) {
    await buildInsertAnonymousLikeQuery(executor, {
      target,
      anonymousDeviceHash,
      now,
    }).executeTakeFirstOrThrow();

    return {
      liked: true,
      activeLikeCount: await countActiveEngagementLikes(target, executor),
    };
  }

  const nextRateWindow = nextAnonymousLikeRateWindow(existing, now);
  const nextState: EngagementLikeState =
    existing.like_state === "active" ? "removed" : "active";

  await buildUpdateAnonymousLikeQuery(executor, {
    id: existing.id,
    likeState: nextState,
    toggleWindowStartedAt: nextRateWindow.startedAt,
    toggleCount: nextRateWindow.count,
    now,
  }).executeTakeFirstOrThrow();

  return {
    liked: nextState === "active",
    activeLikeCount: await countActiveEngagementLikes(target, executor),
  };
}

export async function findPublicEngagementTarget(
  target: EngagementTarget,
  executor: QueryExecutor = db,
): Promise<PublicEngagementTarget | null> {
  switch (target.kind) {
    case "journal_entry": {
      const row = await buildPublicJournalEntryTargetQuery(
        executor,
        target.ref,
      ).executeTakeFirst();
      return row
        ? {
            kind: target.kind,
            ref: row.publicSlug,
            label: row.title,
            href: publicJournalEntryPath(row.publicSlug),
          }
        : null;
    }
    case "lineage_object": {
      const row = await buildPublicLineageObjectTargetQuery(
        executor,
        target.ref,
      ).executeTakeFirst();
      return row
        ? {
            kind: target.kind,
            ref: row.plantObjectId,
            label: row.displayName,
            href: publicLineageObjectPath(row.plantObjectId),
          }
        : null;
    }
    case "variety": {
      const row = await buildPublicVarietyTargetQuery(
        executor,
        target.ref,
      ).executeTakeFirst();
      return row
        ? {
            kind: target.kind,
            ref: row.publicSlug,
            label: row.canonicalName,
            href: publicVarietyPath(row.publicSlug),
          }
        : null;
    }
    case "topic":
      return null;
  }
}

export async function ensureEngagementTargetIsPublic(
  target: EngagementTarget,
  executor: QueryExecutor = db,
) {
  const publicTarget = await findPublicEngagementTarget(target, executor);
  if (!publicTarget) {
    throw new Error("Engagement target is not public.");
  }
  return publicTarget;
}

export function buildInsertEngagementCommentQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    target: EngagementTarget;
    body: string;
    parentCommentId?: string | null;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  return executor
    .insertInto("engagement_comments")
    .values({
      target_kind: input.target.kind,
      target_ref: input.target.ref,
      author_user_id: scope.userId,
      parent_comment_id: input.parentCommentId ?? null,
      body: input.body,
      updated_at: now,
    })
    .returningAll();
}

export function buildListEngagementCommentsQuery(
  executor: QueryExecutor,
  target: EngagementTarget,
  limit = MAX_COMMENT_READBACK,
) {
  return executor
    .selectFrom("engagement_comments")
    .leftJoin("user_public_profiles", (join) =>
      join.onRef(
        "user_public_profiles.user_id",
        "=",
        "engagement_comments.author_user_id",
      ),
    )
    .select([
      "engagement_comments.id as commentId",
      "engagement_comments.parent_comment_id as parentCommentId",
      "engagement_comments.body as body",
      "engagement_comments.created_at as createdAt",
      "user_public_profiles.handle as authorHandle",
      "user_public_profiles.display_name as authorDisplayName",
    ])
    .where("engagement_comments.target_kind", "=", target.kind)
    .where("engagement_comments.target_ref", "=", target.ref)
    .where("engagement_comments.comment_state", "=", "active")
    .orderBy("engagement_comments.created_at", "asc")
    .orderBy("engagement_comments.id", "asc")
    .limit(normalizeReadbackLimit(limit));
}

export function buildGetEngagementBookmarkQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  target: EngagementTarget,
) {
  return executor
    .selectFrom("engagement_bookmarks")
    .selectAll()
    .where("owner_user_id", "=", scope.userId)
    .where("target_kind", "=", target.kind)
    .where("target_ref", "=", target.ref);
}

export function buildUpsertEngagementBookmarkQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    target: EngagementTarget;
    bookmarkState: EngagementBookmarkState;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  return executor
    .insertInto("engagement_bookmarks")
    .values({
      owner_user_id: scope.userId,
      target_kind: input.target.kind,
      target_ref: input.target.ref,
      bookmark_state: input.bookmarkState,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(["owner_user_id", "target_kind", "target_ref"]).doUpdateSet({
        bookmark_state: input.bookmarkState,
        updated_at: now,
      }),
    )
    .returningAll();
}

export function buildListEngagementBookmarksQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  limit = MAX_BOOKMARK_READBACK,
) {
  return executor
    .selectFrom("engagement_bookmarks")
    .select([
      "id as bookmarkId",
      "target_kind as targetKind",
      "target_ref as targetRef",
      "bookmark_state as bookmarkState",
      "created_at as addedAt",
      "updated_at as updatedAt",
    ])
    .where("owner_user_id", "=", scope.userId)
    .where("bookmark_state", "=", "active")
    .orderBy("created_at", "desc")
    .orderBy("id", "asc")
    .limit(normalizeReadbackLimit(limit));
}

export function buildGetAnonymousLikeQuery(
  executor: QueryExecutor,
  target: EngagementTarget,
  anonymousDeviceHash: string,
) {
  return executor
    .selectFrom("engagement_likes")
    .select(["id", "like_state", "toggle_window_started_at", "toggle_count"])
    .where("target_kind", "=", target.kind)
    .where("target_ref", "=", target.ref)
    .where("anonymous_device_hash", "=", anonymousDeviceHash);
}

export function buildInsertAnonymousLikeQuery(
  executor: QueryExecutor,
  input: {
    target: EngagementTarget;
    anonymousDeviceHash: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  return executor
    .insertInto("engagement_likes")
    .values({
      target_kind: input.target.kind,
      target_ref: input.target.ref,
      anonymous_device_hash: input.anonymousDeviceHash,
      toggle_window_started_at: now,
      updated_at: now,
    })
    .returningAll();
}

export function buildUpdateAnonymousLikeQuery(
  executor: QueryExecutor,
  input: {
    id: string;
    likeState: EngagementLikeState;
    toggleWindowStartedAt: Date;
    toggleCount: number;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  return executor
    .updateTable("engagement_likes")
    .set({
      like_state: input.likeState,
      toggle_window_started_at: input.toggleWindowStartedAt,
      toggle_count: input.toggleCount,
      updated_at: now,
    })
    .where("id", "=", input.id)
    .returningAll();
}

export function buildCountActiveEngagementLikesQuery(
  executor: QueryExecutor,
  target: EngagementTarget,
) {
  return executor
    .selectFrom("engagement_likes")
    .select(({ fn }) => [fn.count<number>("id").as("activeLikeCount")])
    .where("target_kind", "=", target.kind)
    .where("target_ref", "=", target.ref)
    .where("like_state", "=", "active");
}

export function buildPublicJournalEntryTargetQuery(
  executor: QueryExecutor,
  publicSlug: string,
) {
  return executor
    .selectFrom("journal_entries")
    .select(["public_slug as publicSlug", "title"])
    .where("public_slug", "=", publicSlug)
    .where("visibility", "=", "public")
    .where("lifecycle_state", "=", "active")
    .where("public_gone_at", "is", null)
    .$narrowType<{ publicSlug: string }>();
}

export function buildPublicLineageObjectTargetQuery(
  executor: QueryExecutor,
  plantObjectId: string,
) {
  return executor
    .selectFrom("plant_objects")
    .innerJoin("journal_entries as public_entries", (join) =>
      join
        .onRef("public_entries.plant_object_id", "=", "plant_objects.id")
        .onRef(
          "public_entries.owner_user_id",
          "=",
          "plant_objects.owner_user_id",
        )
        .on("public_entries.visibility", "=", "public")
        .on("public_entries.lifecycle_state", "=", "active")
        .on("public_entries.public_gone_at", "is", null)
        .on("public_entries.public_slug", "is not", null),
    )
    .select([
      "plant_objects.id as plantObjectId",
      "plant_objects.display_name as displayName",
    ])
    .where("plant_objects.id", "=", plantObjectId)
    .groupBy(["plant_objects.id", "plant_objects.display_name"]);
}

export function buildPublicVarietyTargetQuery(
  executor: QueryExecutor,
  publicSlug: string,
) {
  return executor
    .selectFrom("catalog_items")
    .innerJoin(
      "plant_objects",
      "plant_objects.catalog_item_id",
      "catalog_items.id",
    )
    .innerJoin(
      "journal_entries",
      "journal_entries.plant_object_id",
      "plant_objects.id",
    )
    .innerJoin("spaces", "spaces.id", "journal_entries.space_id")
    .select([
      "catalog_items.public_slug as publicSlug",
      "catalog_items.canonical_name as canonicalName",
    ])
    .where("catalog_items.public_slug", "=", publicSlug)
    .where("catalog_items.status", "in", [...SELECTABLE_CATALOG_STATUSES])
    .where("catalog_items.created_by_user_id", "is", null)
    .where("plant_objects.variety_state", "=", "selected")
    .whereRef(
      "journal_entries.owner_user_id",
      "=",
      "plant_objects.owner_user_id",
    )
    .whereRef("journal_entries.owner_user_id", "=", "spaces.owner_user_id")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .groupBy(["catalog_items.public_slug", "catalog_items.canonical_name"])
    .$narrowType<{ publicSlug: string }>();
}

export function normalizeEngagementTarget(
  kindValue: string,
  refValue: string,
): EngagementTarget {
  const kind = normalizeEngagementTargetKind(kindValue);
  const ref = String(refValue ?? "").trim();

  if (kind === "journal_entry") {
    if (!ref || ref.length > 160 || !JOURNAL_SLUG_PATTERN.test(ref)) {
      throw new Error("Engagement target is not available.");
    }
    return { kind, ref };
  }

  if (kind === "lineage_object") {
    if (!UUID_PATTERN.test(ref)) {
      throw new Error("Engagement target is not available.");
    }
    return { kind, ref: ref.toLowerCase() };
  }

  if (kind === "variety" || kind === "topic") {
    if (!ref || ref.length > 96 || !SLUG_PATTERN.test(ref)) {
      throw new Error("Engagement target is not available.");
    }
    return { kind, ref };
  }

  return assertNever(kind);
}

export function normalizeEngagementReturnTo(
  value: string | null | undefined,
  target: EngagementTarget,
) {
  const raw = String(value ?? "").trim();
  if (
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.includes("\n") &&
    !raw.includes("\r")
  ) {
    return raw;
  }

  return engagementTargetPath(target);
}

export function engagementTargetPath(target: EngagementTarget) {
  switch (target.kind) {
    case "journal_entry":
      return publicJournalEntryPath(target.ref);
    case "lineage_object":
      return publicLineageObjectPath(target.ref);
    case "variety":
      return publicVarietyPath(target.ref);
    case "topic":
      return `/topics/${encodeURIComponent(target.ref)}`;
  }
}

export function hashAnonymousEngagementToken(token: string) {
  const normalizedToken = token.trim();
  if (normalizedToken.length < 16 || normalizedToken.length > 256) {
    throw new Error("Anonymous engagement token is not available.");
  }

  return createHash("sha256")
    .update(`overgarden-engagement:${normalizedToken}`)
    .digest("hex");
}

async function listEngagementComments(
  target: EngagementTarget,
  executor: QueryExecutor,
) {
  const rows = await buildListEngagementCommentsQuery(
    executor,
    target,
    MAX_COMMENT_READBACK,
  ).execute();

  return rows.map((row) => serializeCommentRow(row as EngagementCommentRow));
}

async function countActiveEngagementLikes(
  target: EngagementTarget,
  executor: QueryExecutor,
) {
  const row = await buildCountActiveEngagementLikesQuery(
    executor,
    target,
  ).executeTakeFirst();

  return Number(row?.activeLikeCount ?? 0);
}

function nextAnonymousLikeRateWindow(row: EngagementLikeRow, now: Date) {
  const startedAt = new Date(row.toggle_window_started_at);
  const withinWindow =
    Number.isFinite(startedAt.getTime()) &&
    now.getTime() - startedAt.getTime() <= ANONYMOUS_LIKE_WINDOW_MS;

  if (withinWindow && row.toggle_count >= ANONYMOUS_LIKE_WINDOW_LIMIT) {
    throw new Error("Anonymous engagement rate limit reached.");
  }

  return {
    startedAt: withinWindow ? startedAt : now,
    count: withinWindow ? row.toggle_count + 1 : 1,
  };
}

function serializeCommentRow(
  row: EngagementCommentRow,
): PublicEngagementComment {
  const authorHandle = row.authorHandle
    ? normalizeAuthorHandle(row.authorHandle)
    : null;
  return {
    key: stableEngagementKey("comment", row.commentId),
    replyToken: row.commentId,
    body: row.body,
    authorLabel:
      row.authorDisplayName?.trim() ||
      (authorHandle ? `@${authorHandle}` : "Gardener"),
    authorHandle,
    parentReplyToken: row.parentCommentId,
    createdAt: row.createdAt,
  };
}

function normalizeCommentBody(value: string) {
  const body = String(value ?? "")
    .replace(/\s+$/g, "")
    .trimStart();
  if (!body || body.length > MAX_COMMENT_BODY_LENGTH) {
    throw new Error("Comment must be between 1 and 600 characters.");
  }
  if (UNSAFE_COMMENT_PATTERN.test(body)) {
    throw new Error(
      "Comment cannot include contact details, handles, URLs, invite tokens, or precise location text.",
    );
  }
  return body;
}

function normalizeOptionalCommentId(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("Comment reply target is not available.");
  }
  return normalized.toLowerCase();
}

function normalizeEngagementTargetKind(value: string): EngagementTargetKind {
  if (
    value === "journal_entry" ||
    value === "lineage_object" ||
    value === "variety" ||
    value === "topic"
  ) {
    return value;
  }
  throw new Error("Engagement target is not available.");
}

function normalizeAuthorHandle(value: string) {
  const normalized = value.trim().replace(/^@/, "");
  return normalized || null;
}

function normalizeReadbackLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_COMMENT_READBACK;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_COMMENT_READBACK);
}

function stableEngagementKey(prefix: string, rawId: string) {
  const digest = createHash("sha256").update(rawId).digest("hex");
  return `${prefix}:${digest.slice(0, 16)}`;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported engagement target: ${String(value)}`);
}
