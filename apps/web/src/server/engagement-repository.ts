import "server-only";

import { createHash } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  Database,
  EngagementBookmarkState,
  EngagementCommentReportReason,
  EngagementCommentState,
  EngagementFollowState,
  EngagementLikeState,
  EngagementTargetKind,
} from "@/db/schema";
import {
  publicJournalEntryPath,
  publicLineageObjectPath,
  publicVarietyPath,
} from "@/lib/garden/public-paths";
import { SELECTABLE_CATALOG_STATUSES } from "@/server/catalog-repository";
import { blockProfile } from "@/server/profile-interaction-repository";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const MAX_COMMENT_BODY_LENGTH = 600;
export const ENGAGEMENT_COMMENT_PAGE_SIZE = 8;
const MAX_COMMENT_READBACK = 24;
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
  state?: Exclude<EngagementCommentState, "removed">;
  isOwn?: boolean;
}

export interface PublicEngagementSummary {
  target: EngagementTarget;
  activeLikeCount: number;
  comments: PublicEngagementComment[];
  hasMoreComments?: boolean;
  nextCommentCursor?: string | null;
  viewerBookmarked?: boolean;
  viewerFollowing?: boolean;
}

export interface EngagementBookmarkShelfItem {
  key: string;
  target: PublicEngagementTarget;
  addedAt: Date | string;
  updatedAt: Date | string;
}

interface EngagementCommentRow {
  commentId: string;
  authorUserId: string;
  parentCommentId: string | null;
  body: string;
  commentState: string;
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
  viewerScope: RequestScope | null = null,
  options: { commentCursor?: string | null } = {},
  executor: QueryExecutor = db,
): Promise<PublicEngagementSummary> {
  const normalizedTarget = normalizeEngagementTarget(target.kind, target.ref);
  await ensureEngagementTargetIsPublic(normalizedTarget, executor, viewerScope);

  const [commentPage, activeLikeCount, bookmark, follow] = await Promise.all([
    listEngagementComments(
      normalizedTarget,
      viewerScope,
      decodeCommentPage(options.commentCursor),
      executor,
    ),
    countActiveEngagementLikes(normalizedTarget, executor),
    viewerScope
      ? buildGetEngagementBookmarkQuery(
          executor,
          viewerScope,
          normalizedTarget,
        ).executeTakeFirst()
      : null,
    viewerScope && isFollowableTarget(normalizedTarget)
      ? buildEngagementFollowStateQuery(
          executor,
          viewerScope,
          normalizedTarget,
        ).executeTakeFirst()
      : null,
  ]);

  return {
    target: normalizedTarget,
    activeLikeCount,
    comments: commentPage.comments,
    hasMoreComments: commentPage.hasMore,
    nextCommentCursor: commentPage.nextCursor,
    viewerBookmarked: bookmark?.bookmark_state === "active",
    viewerFollowing: follow?.follow_state === "active",
  };
}

export async function addEngagementComment(
  scope: RequestScope,
  input: {
    target: EngagementTarget;
    body: string;
    clientMutationId: string;
    parentCommentId?: string | null;
  },
  executor: QueryExecutor = db,
): Promise<PublicEngagementComment> {
  const target = normalizeEngagementTarget(input.target.kind, input.target.ref);
  const body = normalizeCommentBody(input.body);
  const clientMutationId = normalizeClientMutationId(input.clientMutationId);
  const parentCommentId = normalizeOptionalCommentId(input.parentCommentId);

  await ensureEngagementTargetIsPublic(target, executor, scope);
  if (parentCommentId) {
    const parent = await buildEngagementReplyTargetQuery(
      executor,
      scope,
      target,
      parentCommentId,
    ).executeTakeFirst();

    if (!parent) {
      throw new Error("Comment reply target is not available.");
    }
  }

  const row = await buildInsertEngagementCommentQuery(executor, scope, {
    target,
    body,
    clientMutationId,
    parentCommentId,
  }).executeTakeFirstOrThrow();

  return serializeCommentRow(
    {
      commentId: row.id,
      authorUserId: row.author_user_id,
      parentCommentId: row.parent_comment_id,
      body: row.body,
      commentState: row.comment_state,
      createdAt: row.created_at,
      authorHandle: null,
      authorDisplayName: null,
    },
    scope,
  );
}

export async function toggleEngagementBookmark(
  scope: RequestScope,
  input: { target: EngagementTarget },
  executor: QueryExecutor = db,
) {
  const target = normalizeEngagementTarget(input.target.kind, input.target.ref);

  await ensureEngagementTargetIsPublic(target, executor, scope);
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

export async function setEngagementBookmark(
  scope: RequestScope,
  input: {
    target: EngagementTarget;
    bookmarkState: EngagementBookmarkState;
  },
  executor: QueryExecutor = db,
) {
  const target = normalizeEngagementTarget(input.target.kind, input.target.ref);
  const bookmarkState = normalizeBookmarkState(input.bookmarkState);
  await ensureEngagementTargetIsPublic(target, executor, scope);
  const row = await buildUpsertEngagementBookmarkQuery(executor, scope, {
    target,
    bookmarkState,
  }).executeTakeFirstOrThrow();
  return { active: row.bookmark_state === "active", bookmark: row };
}

export async function setEngagementFollow(
  scope: RequestScope,
  input: {
    target: EngagementTarget;
    followState: EngagementFollowState;
  },
  executor: QueryExecutor = db,
) {
  const target = normalizeEngagementTarget(input.target.kind, input.target.ref);
  if (!isFollowableTarget(target)) {
    throw new Error("Engagement follow target is not available.");
  }
  const followState = normalizeFollowState(input.followState);
  await ensureEngagementFollowTargetIsAvailable(scope, target, executor);
  const row = await buildUpsertEngagementFollowQuery(executor, scope, {
    target,
    followState,
  }).executeTakeFirstOrThrow();
  return { active: row.follow_state === "active", follow: row };
}

export async function getEngagementFollowState(
  scope: RequestScope,
  input: EngagementTarget,
  executor: QueryExecutor = db,
) {
  const target = normalizeEngagementTarget(input.kind, input.ref);
  if (!isFollowableTarget(target)) return false;
  await ensureEngagementFollowTargetIsAvailable(scope, target, executor);
  const row = await buildEngagementFollowStateQuery(
    executor,
    scope,
    target,
  ).executeTakeFirst();
  return row?.follow_state === "active";
}

export async function deleteEngagementComment(
  scope: RequestScope,
  commentId: string,
  executor: QueryExecutor = db,
) {
  const row = await buildDeleteEngagementCommentQuery(
    executor,
    scope,
    commentId,
  ).executeTakeFirst();
  if (!row) throw new Error("Comment is not available.");
  return row;
}

export async function reportEngagementComment(
  scope: RequestScope,
  input: {
    commentId: string;
    reason: string;
    target: EngagementTarget;
  },
  executor: QueryExecutor = db,
) {
  const reason = normalizeCommentReportReason(input.reason);
  const target = normalizeEngagementTarget(input.target.kind, input.target.ref);
  await ensureEngagementTargetIsPublic(target, executor, scope);
  const comment = await buildActionableEngagementCommentQuery(
    executor,
    scope,
    input.commentId,
    target,
  ).executeTakeFirst();
  if (!comment || comment.authorUserId === scope.userId) {
    throw new Error("Comment is not available.");
  }
  await buildReportEngagementCommentQuery(executor, scope, {
    commentId: input.commentId,
    reason,
  }).executeTakeFirstOrThrow();
  return { target: { kind: comment.targetKind, ref: comment.targetRef } };
}

export async function blockEngagementCommentAuthor(
  scope: RequestScope,
  input: { commentId: string; target: EngagementTarget },
  database: Kysely<Database> = db,
) {
  const target = normalizeEngagementTarget(input.target.kind, input.target.ref);
  await ensureEngagementTargetIsPublic(target, database, scope);
  const comment = await buildActionableEngagementCommentQuery(
    database,
    scope,
    input.commentId,
    target,
  ).executeTakeFirst();
  if (!comment?.authorHandle || comment.authorUserId === scope.userId) {
    throw new Error("Comment author is not available.");
  }
  const result = await blockProfile(scope, comment.authorHandle, database);
  if (result !== "blocked") throw new Error("Comment author is not available.");
  return {
    target: { kind: comment.targetKind, ref: comment.targetRef },
    handle: comment.authorHandle,
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
    const publicTarget = await findPublicEngagementTarget(
      target,
      executor,
      scope,
    );
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
  viewerScope: RequestScope | null = null,
): Promise<PublicEngagementTarget | null> {
  switch (target.kind) {
    case "journal_entry": {
      const row = await buildPublicJournalEntryTargetQuery(
        executor,
        target.ref,
      ).executeTakeFirst();
      if (
        row &&
        !(await engagementActorIsVisible(
          viewerScope,
          row.ownerUserId,
          executor,
        ))
      ) {
        return null;
      }
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
      if (
        row &&
        !(await engagementActorIsVisible(
          viewerScope,
          row.ownerUserId,
          executor,
        ))
      ) {
        return null;
      }
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
    case "topic": {
      const row = await buildPublicTopicTargetQuery(
        executor,
        target.ref,
      ).executeTakeFirst();
      return row
        ? {
            kind: target.kind,
            ref: row.slug,
            label: row.label,
            href: `/topics/${encodeURIComponent(row.slug)}`,
          }
        : null;
    }
  }
}

export async function ensureEngagementTargetIsPublic(
  target: EngagementTarget,
  executor: QueryExecutor = db,
  viewerScope: RequestScope | null = null,
) {
  const publicTarget = await findPublicEngagementTarget(
    target,
    executor,
    viewerScope,
  );
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
    clientMutationId: string;
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
      client_mutation_id: input.clientMutationId,
      parent_comment_id: input.parentCommentId ?? null,
      body: input.body,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(["author_user_id", "client_mutation_id"]).doUpdateSet({
        updated_at: sql.ref("engagement_comments.updated_at"),
      }),
    )
    .returningAll();
}

export function buildEngagementReplyTargetQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  target: EngagementTarget,
  parentCommentId: string,
) {
  return executor
    .selectFrom("engagement_comments")
    .select("id")
    .where("id", "=", normalizeCommentId(parentCommentId))
    .where("target_kind", "=", target.kind)
    .where("target_ref", "=", target.ref)
    .where("comment_state", "=", "active")
    .where("parent_comment_id", "is", null)
    .where(
      noEngagementBlockPredicate(
        scope.userId,
        "engagement_comments.author_user_id",
      ),
    );
}

export function buildListEngagementCommentsQuery(
  executor: QueryExecutor,
  target: EngagementTarget,
  limit = MAX_COMMENT_READBACK,
  viewerScope: RequestScope | null = null,
  cursor: { createdAt: Date; commentId: string } | null = null,
) {
  let query = executor
    .selectFrom("engagement_comments")
    .leftJoin("user_public_profiles", (join) =>
      join
        .onRef(
          "user_public_profiles.user_id",
          "=",
          "engagement_comments.author_user_id",
        )
        .on("user_public_profiles.profile_visibility", "=", "public")
        .on("user_public_profiles.profile_lifecycle_state", "=", "active")
        .on("user_public_profiles.removed_at", "is", null),
    )
    .select([
      "engagement_comments.id as commentId",
      "engagement_comments.author_user_id as authorUserId",
      "engagement_comments.parent_comment_id as parentCommentId",
      "engagement_comments.body as body",
      "engagement_comments.comment_state as commentState",
      "engagement_comments.created_at as createdAt",
      "user_public_profiles.handle as authorHandle",
      "user_public_profiles.display_name as authorDisplayName",
    ])
    .where("engagement_comments.target_kind", "=", target.kind)
    .where("engagement_comments.target_ref", "=", target.ref)
    .where("engagement_comments.parent_comment_id", "is", null)
    .where("engagement_comments.comment_state", "in", [
      "active",
      "deleted",
      "reported",
    ])
    .$if(Boolean(viewerScope), (qb) =>
      qb.where(
        noEngagementBlockPredicate(
          viewerScope!.userId,
          "engagement_comments.author_user_id",
        ),
      ),
    );

  if (cursor) {
    query = query.where((eb) =>
      eb.or([
        eb("engagement_comments.created_at", ">", cursor.createdAt),
        eb.and([
          eb("engagement_comments.created_at", "=", cursor.createdAt),
          eb("engagement_comments.id", ">", cursor.commentId),
        ]),
      ]),
    );
  }

  return query
    .orderBy("engagement_comments.created_at", "asc")
    .orderBy("engagement_comments.id", "asc")
    .limit(normalizeReadbackLimit(limit));
}

export function buildListEngagementCommentRepliesQuery(
  executor: QueryExecutor,
  target: EngagementTarget,
  parentCommentIds: readonly string[],
  viewerScope: RequestScope | null = null,
) {
  return executor
    .selectFrom("engagement_comments")
    .leftJoin("user_public_profiles", (join) =>
      join
        .onRef(
          "user_public_profiles.user_id",
          "=",
          "engagement_comments.author_user_id",
        )
        .on("user_public_profiles.profile_visibility", "=", "public")
        .on("user_public_profiles.profile_lifecycle_state", "=", "active")
        .on("user_public_profiles.removed_at", "is", null),
    )
    .select([
      "engagement_comments.id as commentId",
      "engagement_comments.author_user_id as authorUserId",
      "engagement_comments.parent_comment_id as parentCommentId",
      "engagement_comments.body as body",
      "engagement_comments.comment_state as commentState",
      "engagement_comments.created_at as createdAt",
      "user_public_profiles.handle as authorHandle",
      "user_public_profiles.display_name as authorDisplayName",
    ])
    .where("engagement_comments.target_kind", "=", target.kind)
    .where("engagement_comments.target_ref", "=", target.ref)
    .where("engagement_comments.parent_comment_id", "in", [...parentCommentIds])
    .where("engagement_comments.comment_state", "in", [
      "active",
      "deleted",
      "reported",
    ])
    .$if(Boolean(viewerScope), (qb) =>
      qb.where(
        noEngagementBlockPredicate(
          viewerScope!.userId,
          "engagement_comments.author_user_id",
        ),
      ),
    )
    .orderBy("engagement_comments.created_at", "asc")
    .orderBy("engagement_comments.id", "asc")
    .limit(MAX_COMMENT_READBACK);
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

export function buildEngagementFollowStateQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  target: Pick<EngagementTarget, "kind" | "ref"> & {
    kind: "lineage_object" | "topic";
  },
) {
  return executor
    .selectFrom("engagement_follows")
    .select(["id", "follow_state"])
    .where("follower_user_id", "=", scope.userId)
    .where("target_kind", "=", target.kind)
    .where("target_ref", "=", target.ref)
    .limit(1);
}

export function buildUpsertEngagementFollowQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    target: Pick<EngagementTarget, "kind" | "ref"> & {
      kind: "lineage_object" | "topic";
    };
    followState: EngagementFollowState;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  return executor
    .insertInto("engagement_follows")
    .values({
      follower_user_id: scope.userId,
      target_kind: input.target.kind,
      target_ref: input.target.ref,
      follow_state: input.followState,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc
        .columns(["follower_user_id", "target_kind", "target_ref"])
        .doUpdateSet({
          follow_state: input.followState,
          updated_at: now,
        }),
    )
    .returningAll();
}

export function buildDeleteEngagementCommentQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  commentId: string,
  now = new Date(),
) {
  return executor
    .updateTable("engagement_comments")
    .set({
      comment_state: "deleted",
      body: "Deleted.",
      updated_at: now,
    })
    .where("id", "=", normalizeCommentId(commentId))
    .where("author_user_id", "=", scope.userId)
    .where("comment_state", "=", "active")
    .returning(["id", "target_kind", "target_ref"]);
}

export function buildReportEngagementCommentQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    commentId: string;
    reason: EngagementCommentReportReason;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  return executor
    .insertInto("engagement_comment_reports")
    .values({
      reporter_user_id: scope.userId,
      comment_id: normalizeCommentId(input.commentId),
      report_reason: input.reason,
      report_state: "submitted",
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(["reporter_user_id", "comment_id"]).doUpdateSet({
        report_reason: input.reason,
        report_state: "submitted",
        updated_at: now,
      }),
    )
    .returning("id");
}

export function buildActionableEngagementCommentQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  commentId: string,
  target: EngagementTarget,
) {
  return executor
    .selectFrom("engagement_comments as comments")
    .leftJoin("user_public_profiles as profiles", (join) =>
      join.onRef("profiles.user_id", "=", "comments.author_user_id"),
    )
    .select([
      "comments.author_user_id as authorUserId",
      "comments.target_kind as targetKind",
      "comments.target_ref as targetRef",
      "profiles.handle as authorHandle",
    ])
    .where("comments.id", "=", normalizeCommentId(commentId))
    .where("comments.target_kind", "=", target.kind)
    .where("comments.target_ref", "=", target.ref)
    .where("comments.comment_state", "=", "active")
    .where(noEngagementBlockPredicate(scope.userId, "comments.author_user_id"))
    .limit(1);
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
    .select([
      "public_slug as publicSlug",
      "title",
      "owner_user_id as ownerUserId",
    ])
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
      "plant_objects.owner_user_id as ownerUserId",
    ])
    .where("plant_objects.id", "=", plantObjectId)
    .groupBy([
      "plant_objects.id",
      "plant_objects.display_name",
      "plant_objects.owner_user_id",
    ]);
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

export function buildPublicTopicTargetQuery(
  executor: QueryExecutor,
  slug: string,
) {
  return executor
    .selectFrom("journal_topics")
    .innerJoin(
      "journal_entry_topic_signals",
      "journal_entry_topic_signals.topic_id",
      "journal_topics.id",
    )
    .innerJoin(
      "journal_entries",
      "journal_entries.id",
      "journal_entry_topic_signals.journal_entry_id",
    )
    .select(["journal_topics.slug", "journal_topics.label"])
    .where("journal_topics.slug", "=", slug)
    .where("journal_topics.trust_state", "=", "curated")
    .where("journal_entry_topic_signals.review_state", "=", "accepted")
    .where(
      "journal_entry_topic_signals.public_membership_state",
      "=",
      "eligible",
    )
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.public_gone_at", "is", null)
    .groupBy(["journal_topics.slug", "journal_topics.label"]);
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
  viewerScope: RequestScope | null,
  page: number,
  executor: QueryExecutor,
) {
  const visibleRootLimit = Math.min(
    page * ENGAGEMENT_COMMENT_PAGE_SIZE,
    MAX_COMMENT_READBACK,
  );
  const rootRows = (await buildListEngagementCommentsQuery(
    executor,
    target,
    visibleRootLimit + 1,
    viewerScope,
  ).execute()) as EngagementCommentRow[];
  const visibleRoots = rootRows.slice(0, visibleRootLimit);
  const rootIds = visibleRoots.map((row) => row.commentId);
  const replyRows = rootIds.length
    ? ((await buildListEngagementCommentRepliesQuery(
        executor,
        target,
        rootIds,
        viewerScope,
      ).execute()) as EngagementCommentRow[])
    : [];
  const rows = [...visibleRoots, ...replyRows].sort((left, right) => {
    const rootOrder = new Map(rootIds.map((id, index) => [id, index]));
    const leftRoot = left.parentCommentId ?? left.commentId;
    const rightRoot = right.parentCommentId ?? right.commentId;
    const rootDelta =
      (rootOrder.get(leftRoot) ?? Number.MAX_SAFE_INTEGER) -
      (rootOrder.get(rightRoot) ?? Number.MAX_SAFE_INTEGER);
    if (rootDelta !== 0) return rootDelta;
    if (!left.parentCommentId) return -1;
    if (!right.parentCommentId) return 1;
    return timestamp(left.createdAt) - timestamp(right.createdAt);
  });

  const lastRoot = visibleRoots.at(-1);
  return {
    comments: rows.map((row) => serializeCommentRow(row, viewerScope)),
    hasMore:
      visibleRootLimit < MAX_COMMENT_READBACK &&
      rootRows.length > visibleRootLimit,
    nextCursor:
      visibleRootLimit < MAX_COMMENT_READBACK &&
      rootRows.length > visibleRootLimit &&
      lastRoot
        ? encodeCommentPage(page + 1)
        : null,
  };
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
  viewerScope: RequestScope | null = null,
): PublicEngagementComment {
  const authorHandle = row.authorHandle
    ? normalizeAuthorHandle(row.authorHandle)
    : null;
  return {
    key: stableEngagementKey("comment", row.commentId),
    replyToken: row.commentId,
    body:
      row.commentState === "active"
        ? row.body
        : row.commentState === "deleted"
          ? "Comment deleted by its author."
          : "Comment is under review.",
    authorLabel:
      row.authorDisplayName?.trim() ||
      (authorHandle ? `@${authorHandle}` : "Gardener"),
    authorHandle,
    parentReplyToken: row.parentCommentId,
    createdAt: row.createdAt,
    state: row.commentState as Exclude<EngagementCommentState, "removed">,
    isOwn: viewerScope?.userId === row.authorUserId,
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
  return normalizeCommentId(normalized);
}

function normalizeCommentId(value: string) {
  const normalized = String(value ?? "").trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("Comment is not available.");
  }
  return normalized.toLowerCase();
}

function normalizeClientMutationId(value: string) {
  const normalized = String(value ?? "").trim();
  if (
    normalized.length < 16 ||
    normalized.length > 160 ||
    !/^[A-Za-z0-9:_-]+$/.test(normalized)
  ) {
    throw new Error("Comment submission is not available.");
  }
  return normalized;
}

function normalizeBookmarkState(value: string): EngagementBookmarkState {
  if (value === "active" || value === "removed") return value;
  throw new Error("Bookmark state is not available.");
}

function normalizeFollowState(value: string): EngagementFollowState {
  if (value === "active" || value === "removed") return value;
  throw new Error("Follow state is not available.");
}

function normalizeCommentReportReason(
  value: string,
): EngagementCommentReportReason {
  if (
    value === "spam" ||
    value === "harassment" ||
    value === "privacy" ||
    value === "misinformation" ||
    value === "other"
  ) {
    return value;
  }
  throw new Error("Comment report reason is not available.");
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

function isFollowableTarget(
  target: EngagementTarget,
): target is EngagementTarget & { kind: "lineage_object" | "topic" } {
  return target.kind === "lineage_object" || target.kind === "topic";
}

async function ensureEngagementFollowTargetIsAvailable(
  scope: RequestScope,
  target: EngagementTarget & { kind: "lineage_object" | "topic" },
  executor: QueryExecutor,
) {
  await ensureEngagementTargetIsPublic(target, executor, scope);
  if (target.kind === "topic") return;

  const object = await executor
    .selectFrom("plant_objects")
    .select("owner_user_id as ownerUserId")
    .where("id", "=", target.ref)
    .executeTakeFirst();
  if (!object || object.ownerUserId === scope.userId) {
    throw new Error("Engagement follow target is not available.");
  }
  const blocked = await executor
    .selectFrom("profile_blocks")
    .select("id")
    .where("block_state", "=", "active")
    .where((eb) =>
      eb.or([
        eb.and([
          eb("blocker_user_id", "=", scope.userId),
          eb("blocked_user_id", "=", object.ownerUserId),
        ]),
        eb.and([
          eb("blocker_user_id", "=", object.ownerUserId),
          eb("blocked_user_id", "=", scope.userId),
        ]),
      ]),
    )
    .executeTakeFirst();
  if (blocked) throw new Error("Engagement follow target is not available.");
}

function noEngagementBlockPredicate(userId: string, actorRef: string) {
  return sql<boolean>`not exists (
    select 1 from "profile_blocks"
    where profile_blocks.block_state = 'active'
      and (
        (profile_blocks.blocker_user_id = ${userId}
          and profile_blocks.blocked_user_id = ${sql.ref(actorRef)})
        or
        (profile_blocks.blocker_user_id = ${sql.ref(actorRef)}
          and profile_blocks.blocked_user_id = ${userId})
      )
  )`;
}

export function buildEngagementBlockStateQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  actorUserId: string,
) {
  return executor
    .selectFrom("profile_blocks")
    .select("id")
    .where("block_state", "=", "active")
    .where((eb) =>
      eb.or([
        eb.and([
          eb("blocker_user_id", "=", scope.userId),
          eb("blocked_user_id", "=", actorUserId),
        ]),
        eb.and([
          eb("blocker_user_id", "=", actorUserId),
          eb("blocked_user_id", "=", scope.userId),
        ]),
      ]),
    );
}

async function engagementActorIsVisible(
  scope: RequestScope | null,
  actorUserId: string,
  executor: QueryExecutor,
) {
  if (!scope || actorUserId === scope.userId) return true;
  const block = await buildEngagementBlockStateQuery(
    executor,
    scope,
    actorUserId,
  ).executeTakeFirst();
  return !block;
}

function encodeCommentPage(page: number) {
  return Buffer.from(JSON.stringify({ page }), "utf8").toString("base64url");
}

function decodeCommentPage(value: string | null | undefined) {
  if (!value || value.length > 64) return 1;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { page?: unknown };
    return typeof parsed.page === "number" &&
      Number.isInteger(parsed.page) &&
      parsed.page >= 1 &&
      parsed.page <=
        Math.ceil(MAX_COMMENT_READBACK / ENGAGEMENT_COMMENT_PAGE_SIZE)
      ? parsed.page
      : 1;
  } catch {
    return 1;
  }
}

function timestamp(value: Date | string) {
  const result =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(result) ? result : 0;
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
