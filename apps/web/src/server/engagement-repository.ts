import "server-only";

import { createHash } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { db } from "@/db";
import type {
  Database,
  EngagementBookmarkState,
  EngagementCommentReportReason,
  EngagementCommentReportState,
  EngagementCommentState,
  EngagementFollowState,
  EngagementLikeState,
  EngagementTargetKind,
} from "@/db/schema";
import {
  localizedPublicJournalEvidencePath,
  publicLineageObjectPath,
  publicVarietyPath,
} from "@/lib/garden/public-paths";
import type { PublicLocale } from "@/lib/public-localization";
import {
  assertNoPreciseLocationText,
  containsPreciseLocationText,
} from "@/lib/privacy/precise-location-text";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import { SELECTABLE_CATALOG_STATUSES } from "@/server/catalog-repository";
import { publicLaunchSurfacePredicates } from "@/server/launch-corpus/public-surface";
import { blockUserId } from "@/server/profile-interaction-repository";
import { assertAdminCapabilityForScope } from "@/server/admin-access";
import {
  acquireInteractionAdmissionLock,
  configureInteractionAdmissionTransaction,
  consumeInteractionQuota,
  InteractionAdmissionError,
  removeExpiredInteractionQuotaWindows,
  rethrowAsInteractionUnavailable,
  utcDayWindow,
} from "@/server/interaction-admission";
import type { RequestScope } from "@/server/request-scope";

type QueryExecutor = Kysely<Database> | Transaction<Database>;

const MAX_COMMENT_BODY_LENGTH = 600;
export const ENGAGEMENT_COMMENT_PAGE_SIZE = 8;
const MAX_COMMENT_READBACK = 24;
const MAX_BOOKMARK_READBACK = 50;
const ANONYMOUS_LIKE_WINDOW_MS = 24 * 60 * 60 * 1000;
const ANONYMOUS_LIKE_WINDOW_LIMIT = 20;
const ANONYMOUS_LIKE_ACTIVE_TARGET_LIMIT = 64;
const ANONYMOUS_LIKE_RESIDENT_TARGET_LIMIT = 128;
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

/** Comment targets intentionally have a narrower surface than generic social
 * engagement targets. Community contributions may host discussion, but never
 * likes, bookmarks, follows, counts, or anonymous device activity. */
export type EngagementCommentTargetKind =
  | EngagementTargetKind
  | "community_contribution";

export interface EngagementCommentTarget {
  kind: EngagementCommentTargetKind;
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

export interface PublicEngagementCommentThread {
  target: EngagementCommentTarget;
  comments: PublicEngagementComment[];
  hasMoreComments?: boolean;
  nextCommentCursor?: string | null;
}

export interface AnonymousEngagementLikeResult {
  liked: boolean;
  activeLikeCount: number;
}

export interface EngagementBookmarkShelfItem {
  key: string;
  target: PublicEngagementTarget;
  addedAt: Date | string;
  updatedAt: Date | string;
}

export type EngagementModerationAction = "review" | "dismiss" | "remove";

export interface EngagementCommentModerationQueueItem {
  reportId: string;
  commentId: string;
  targetKind: EngagementCommentTargetKind;
  targetRef: string;
  reason: EngagementCommentReportReason;
  reportState: EngagementCommentReportState;
  createdAt: Date | string;
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
  capability_expires_at: Date | string | null;
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

export async function getEngagementCommentThread(
  target: EngagementCommentTarget,
  viewerScope: RequestScope | null = null,
  options: { commentCursor?: string | null } = {},
  executor: QueryExecutor = db,
): Promise<PublicEngagementCommentThread> {
  const normalizedTarget = normalizeEngagementCommentTarget(
    target.kind,
    target.ref,
  );
  await ensureEngagementCommentTargetIsPublic(
    normalizedTarget,
    executor,
    viewerScope,
  );
  const commentPage = await listEngagementComments(
    normalizedTarget,
    viewerScope,
    decodeCommentPage(options.commentCursor),
    executor,
  );
  return {
    target: normalizedTarget,
    comments: commentPage.comments,
    hasMoreComments: commentPage.hasMore,
    nextCommentCursor: commentPage.nextCursor,
  };
}

export async function addEngagementComment(
  scope: RequestScope,
  input: {
    target: EngagementCommentTarget;
    body: string;
    clientMutationId: string;
    parentCommentId?: string | null;
  },
  executor: QueryExecutor = db,
): Promise<PublicEngagementComment> {
  const target = normalizeEngagementCommentTarget(
    input.target.kind,
    input.target.ref,
  );
  const body = normalizeCommentBody(input.body);
  const clientMutationId = normalizeClientMutationId(input.clientMutationId);
  const parentCommentId = normalizeOptionalCommentId(input.parentCommentId);

  if (!isDatabaseTransaction(executor)) {
    return (executor as Kysely<Database>)
      .transaction()
      .execute((trx) => addEngagementComment(scope, input, trx));
  }

  try {
    const now = new Date();
    await configureInteractionAdmissionTransaction(executor);
    await acquireInteractionAdmissionLock(
      executor,
      `ove237:comment:${scope.userId}:${clientMutationId}`,
    );

    const existing = await buildFindEngagementCommentByClientMutationQuery(
      executor,
      scope,
      clientMutationId,
    ).executeTakeFirst();
    if (existing) {
      assertExistingCommentMatchesInput(existing, {
        target,
        body,
        parentCommentId,
      });
      return serializeCommentRow(
        {
          commentId: existing.id,
          authorUserId: existing.author_user_id,
          parentCommentId: existing.parent_comment_id,
          body: existing.body,
          commentState: existing.comment_state,
          createdAt: existing.created_at,
          authorHandle: null,
          authorDisplayName: null,
        },
        scope,
      );
    }

    if (target.kind === "community_contribution") {
      const contribution =
        await buildPublicCommunityContributionCommentTargetQuery(
          executor,
          target.ref,
          scope,
        )
          .forUpdate()
          .executeTakeFirst();
      if (!contribution || contribution.discussionState !== "open") {
        throw new Error("Engagement comment target is not available.");
      }
    } else {
      await ensureEngagementCommentTargetIsPublic(target, executor, scope);
    }
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

    const quota = utcDayWindow(now);
    const targetScope = `${target.kind}:${target.ref}`;
    await removeExpiredInteractionQuotaWindows(executor, scope.userId, now);
    if (parentCommentId) {
      await consumeInteractionQuota(executor, {
        actorUserId: scope.userId,
        policy: "comment_reply_global",
        scope: "global",
        limit: 24,
        windowStartedAt: quota.startedAt,
        expiresAt: quota.expiresAt,
      });
      await consumeInteractionQuota(executor, {
        actorUserId: scope.userId,
        policy: "comment_reply_target",
        scope: targetScope,
        limit: 6,
        windowStartedAt: quota.startedAt,
        expiresAt: quota.expiresAt,
      });
    } else {
      await consumeInteractionQuota(executor, {
        actorUserId: scope.userId,
        policy: "comment_root_global",
        scope: "global",
        limit: 12,
        windowStartedAt: quota.startedAt,
        expiresAt: quota.expiresAt,
      });
      await consumeInteractionQuota(executor, {
        actorUserId: scope.userId,
        policy: "comment_root_target",
        scope: targetScope,
        limit: 3,
        windowStartedAt: quota.startedAt,
        expiresAt: quota.expiresAt,
      });
    }

    const row = await buildInsertEngagementCommentQuery(executor, scope, {
      target,
      body,
      clientMutationId,
      parentCommentId,
      now,
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
  } catch (error) {
    rethrowAsInteractionUnavailable(error);
  }
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
  target: EngagementCommentTarget,
  executor: QueryExecutor = db,
) {
  const row = await buildDeleteEngagementCommentQuery(
    executor,
    scope,
    commentId,
    target,
  ).executeTakeFirst();
  if (!row) throw new Error("Comment is not available.");
  return row;
}

export async function reportEngagementComment(
  scope: RequestScope,
  input: {
    commentId: string;
    reason: string;
    target: EngagementCommentTarget;
  },
  executor: QueryExecutor = db,
) {
  const reason = normalizeCommentReportReason(input.reason);
  const target = normalizeEngagementCommentTarget(
    input.target.kind,
    input.target.ref,
  );
  await ensureEngagementCommentTargetIsPublic(target, executor, scope);
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
  input: { commentId: string; target: EngagementCommentTarget },
  database: Kysely<Database> = db,
) {
  const target = normalizeEngagementCommentTarget(
    input.target.kind,
    input.target.ref,
  );
  await ensureEngagementCommentTargetIsPublic(target, database, scope);
  const comment = await buildActionableEngagementCommentQuery(
    database,
    scope,
    input.commentId,
    target,
  ).executeTakeFirst();
  if (!comment || comment.authorUserId === scope.userId) {
    throw new Error("Comment author is not available.");
  }
  const result = await blockUserId(scope, comment.authorUserId, database);
  if (result !== "blocked") throw new Error("Comment author is not available.");
  return {
    target: { kind: comment.targetKind, ref: comment.targetRef },
  };
}

export async function listEngagementCommentModerationQueue(
  scope: RequestScope,
  executor: Kysely<Database> = db,
): Promise<EngagementCommentModerationQueueItem[]> {
  await assertAdminCapabilityForScope(scope, "operator:mutate", executor);
  const rows = await executor
    .selectFrom("engagement_comment_reports")
    .innerJoin(
      "engagement_comments",
      "engagement_comments.id",
      "engagement_comment_reports.comment_id",
    )
    .select([
      "engagement_comment_reports.id as reportId",
      "engagement_comment_reports.comment_id as commentId",
      "engagement_comment_reports.report_reason as reason",
      "engagement_comment_reports.report_state as reportState",
      "engagement_comment_reports.created_at as createdAt",
      "engagement_comments.target_kind as targetKind",
      "engagement_comments.target_ref as targetRef",
    ])
    .where("engagement_comment_reports.report_state", "in", [
      "submitted",
      "reviewed",
    ])
    .where("engagement_comments.comment_state", "=", "active")
    .orderBy("engagement_comment_reports.created_at", "asc")
    .orderBy("engagement_comment_reports.id", "asc")
    .limit(100)
    .execute();

  return rows.map((row) => ({
    reportId: row.reportId,
    commentId: row.commentId,
    targetKind: normalizeEngagementCommentTarget(row.targetKind, row.targetRef)
      .kind,
    targetRef: row.targetRef,
    reason: normalizeCommentReportReason(row.reason),
    reportState: normalizeEngagementCommentReportState(row.reportState),
    createdAt: row.createdAt,
  }));
}

export async function moderateEngagementCommentReport(
  scope: RequestScope,
  input: { reportId: string; action: EngagementModerationAction },
  database: Kysely<Database> = db,
) {
  await assertAdminCapabilityForScope(scope, "operator:mutate", database);
  const reportId = normalizeCommentId(input.reportId);
  const action = normalizeEngagementModerationAction(input.action);

  return database.transaction().execute(async (trx) => {
    const selected = await trx
      .selectFrom("engagement_comment_reports")
      .innerJoin(
        "engagement_comments",
        "engagement_comments.id",
        "engagement_comment_reports.comment_id",
      )
      .select([
        "engagement_comment_reports.id as reportId",
        "engagement_comment_reports.comment_id as commentId",
        "engagement_comment_reports.report_reason as reason",
        "engagement_comment_reports.report_state as reportState",
        "engagement_comments.comment_state as commentState",
      ])
      .where("engagement_comment_reports.id", "=", reportId)
      .forUpdate()
      .executeTakeFirst();
    if (!selected) throw new Error("Comment report is not available.");

    const reports = await trx
      .selectFrom("engagement_comment_reports")
      .select(["id", "report_state"])
      .where("comment_id", "=", selected.commentId)
      .where("report_state", "in", ["submitted", "reviewed"])
      .orderBy("id", "asc")
      .forUpdate()
      .execute();
    const selectedOpen = reports.find((report) => report.id === reportId);
    if (!selectedOpen || selected.commentState !== "active") {
      return { state: selected.reportState, changed: false } as const;
    }

    const now = new Date();
    if (action === "review") {
      if (selectedOpen.report_state !== "submitted") {
        return { state: selected.reportState, changed: false } as const;
      }
      await trx
        .updateTable("engagement_comment_reports")
        .set({
          report_state: "reviewed",
          reviewed_at: now,
          reviewed_by_user_id: scope.userId,
          updated_at: now,
        })
        .where("id", "=", reportId)
        .where("report_state", "=", "submitted")
        .executeTakeFirstOrThrow();
      await insertEngagementModerationAudit(trx, {
        commentId: selected.commentId,
        reportId,
        actorUserId: scope.userId,
        action,
        reason: selected.reason,
        previousState: "submitted",
        nextState: "reviewed",
        now,
      });
      return { state: "reviewed", changed: true } as const;
    }

    const terminalState = action === "dismiss" ? "dismissed" : "actioned";
    if (action === "remove") {
      await trx
        .updateTable("engagement_comments")
        .set({ comment_state: "removed", updated_at: now })
        .where("id", "=", selected.commentId)
        .where("comment_state", "=", "active")
        .executeTakeFirstOrThrow();
      await trx
        .updateTable("engagement_comment_reports")
        .set({
          report_state: "actioned",
          resolved_at: now,
          resolved_by_user_id: scope.userId,
          updated_at: now,
        })
        .where("comment_id", "=", selected.commentId)
        .where("report_state", "in", ["submitted", "reviewed"])
        .executeTakeFirst();
    } else {
      await trx
        .updateTable("engagement_comment_reports")
        .set({
          report_state: terminalState,
          resolved_at: now,
          resolved_by_user_id: scope.userId,
          updated_at: now,
        })
        .where("id", "=", reportId)
        .where("report_state", "in", ["submitted", "reviewed"])
        .executeTakeFirstOrThrow();
    }
    await insertEngagementModerationAudit(trx, {
      commentId: selected.commentId,
      reportId,
      actorUserId: scope.userId,
      action,
      reason: selected.reason,
      previousState: selectedOpen.report_state as "submitted" | "reviewed",
      nextState: terminalState,
      now,
    });
    return { state: terminalState, changed: true } as const;
  });
}

export async function listEngagementBookmarks(
  scope: RequestScope,
  executor: QueryExecutor = db,
  locale: PublicLocale = "uk",
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
      locale,
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
  input: {
    target: EngagementTarget;
    anonymousToken: string;
    capabilityExpiresAt: Date;
    now?: Date;
  },
  executor: QueryExecutor = db,
): Promise<AnonymousEngagementLikeResult> {
  const target = normalizeEngagementTarget(input.target.kind, input.target.ref);
  const anonymousDeviceHash = hashAnonymousEngagementToken(
    input.anonymousToken,
  );
  const now = input.now ?? new Date();
  if (input.capabilityExpiresAt.getTime() <= now.getTime()) {
    throw new InteractionAdmissionError("unavailable");
  }

  if (!isDatabaseTransaction(executor)) {
    return (executor as Kysely<Database>)
      .transaction()
      .execute((trx) => toggleAnonymousEngagementLike(input, trx));
  }

  try {
    await configureInteractionAdmissionTransaction(executor);
    await acquireInteractionAdmissionLock(
      executor,
      `ove237:like:${target.kind}:${target.ref}`,
    );
    await ensureEngagementTargetIsPublic(target, executor);
    await removeExpiredAnonymousLikeRows(executor, target, now);
    const budget = await synchronizeAnonymousLikeTargetBudget(
      executor,
      target,
      now,
    );
    const existing = await buildGetAnonymousLikeQuery(
      executor,
      target,
      anonymousDeviceHash,
      now,
    ).executeTakeFirst();

    if (!existing) {
      if (
        budget.activeLikeCount >= ANONYMOUS_LIKE_ACTIVE_TARGET_LIMIT ||
        budget.residentLikeCount >= ANONYMOUS_LIKE_RESIDENT_TARGET_LIMIT
      ) {
        throw new InteractionAdmissionError("capacity");
      }
      await buildInsertAnonymousLikeQuery(executor, {
        target,
        anonymousDeviceHash,
        capabilityExpiresAt: input.capabilityExpiresAt,
        now,
      }).executeTakeFirstOrThrow();

      const synchronized = await synchronizeAnonymousLikeTargetBudget(
        executor,
        target,
        now,
      );
      return { liked: true, activeLikeCount: synchronized.activeLikeCount };
    }

    const nextRateWindow = nextAnonymousLikeRateWindow(existing, now);
    const nextState: EngagementLikeState =
      existing.like_state === "active" ? "removed" : "active";
    if (
      nextState === "active" &&
      budget.activeLikeCount >= ANONYMOUS_LIKE_ACTIVE_TARGET_LIMIT
    ) {
      throw new InteractionAdmissionError("capacity");
    }

    await buildUpdateAnonymousLikeQuery(executor, {
      id: existing.id,
      likeState: nextState,
      toggleWindowStartedAt: nextRateWindow.startedAt,
      toggleCount: nextRateWindow.count,
      now,
    }).executeTakeFirstOrThrow();

    const synchronized = await synchronizeAnonymousLikeTargetBudget(
      executor,
      target,
      now,
    );
    return {
      liked: nextState === "active",
      activeLikeCount: synchronized.activeLikeCount,
    };
  } catch (error) {
    rethrowAsInteractionUnavailable(error);
  }
}

export async function findPublicEngagementTarget(
  target: EngagementTarget,
  executor: QueryExecutor = db,
  viewerScope: RequestScope | null = null,
  locale: PublicLocale = "uk",
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
            href: localizedPublicJournalEvidencePath(locale, row.publicSlug),
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

export async function ensureEngagementCommentTargetIsPublic(
  target: EngagementCommentTarget,
  executor: QueryExecutor = db,
  viewerScope: RequestScope | null = null,
) {
  if (target.kind !== "community_contribution") {
    return ensureEngagementTargetIsPublic(
      target as EngagementTarget,
      executor,
      viewerScope,
    );
  }

  const contribution = await buildPublicCommunityContributionCommentTargetQuery(
    executor,
    target.ref,
    viewerScope,
  ).executeTakeFirst();
  if (!contribution) {
    throw new Error("Engagement comment target is not public.");
  }
  return contribution;
}

export function buildInsertEngagementCommentQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  input: {
    target: EngagementCommentTarget;
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

function buildFindEngagementCommentByClientMutationQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  clientMutationId: string,
) {
  return executor
    .selectFrom("engagement_comments")
    .selectAll()
    .where("author_user_id", "=", scope.userId)
    .where("client_mutation_id", "=", clientMutationId)
    .limit(1);
}

export function buildEngagementReplyTargetQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  target: EngagementCommentTarget,
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
  target: EngagementCommentTarget,
  limit = MAX_COMMENT_READBACK,
  viewerScope: RequestScope | null = null,
  cursor: { createdAt: Date; commentId: string } | null = null,
) {
  let query = executor
    .selectFrom("engagement_comments")
    .leftJoin("user_handle_registry as comment_author_handles", (join) =>
      join
        .onRef(
          "comment_author_handles.user_id",
          "=",
          "engagement_comments.author_user_id",
        )
        .on("comment_author_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles", (join) =>
      join
        .onRef(
          "user_public_profiles.user_id",
          "=",
          "comment_author_handles.user_id",
        )
        .onRef(
          "user_public_profiles.normalized_handle",
          "=",
          "comment_author_handles.normalized_handle",
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
  target: EngagementCommentTarget,
  parentCommentIds: readonly string[],
  viewerScope: RequestScope | null = null,
) {
  return executor
    .selectFrom("engagement_comments")
    .leftJoin("user_handle_registry as comment_author_handles", (join) =>
      join
        .onRef(
          "comment_author_handles.user_id",
          "=",
          "engagement_comments.author_user_id",
        )
        .on("comment_author_handles.lifecycle_state", "=", "current"),
    )
    .leftJoin("user_public_profiles", (join) =>
      join
        .onRef(
          "user_public_profiles.user_id",
          "=",
          "comment_author_handles.user_id",
        )
        .onRef(
          "user_public_profiles.normalized_handle",
          "=",
          "comment_author_handles.normalized_handle",
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
  target: EngagementCommentTarget,
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
  target: EngagementCommentTarget,
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
    .where("target_kind", "=", target.kind)
    .where("target_ref", "=", target.ref)
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
        report_reason: sql`case when engagement_comment_reports.report_state = 'submitted' then excluded.report_reason else engagement_comment_reports.report_reason end`,
        updated_at: sql`case when engagement_comment_reports.report_state = 'submitted' then excluded.updated_at else engagement_comment_reports.updated_at end`,
      }),
    )
    .returning("id");
}

export function buildActionableEngagementCommentQuery(
  executor: QueryExecutor,
  scope: RequestScope,
  commentId: string,
  target: EngagementCommentTarget,
) {
  return executor
    .selectFrom("engagement_comments as comments")
    .select([
      "comments.author_user_id as authorUserId",
      "comments.target_kind as targetKind",
      "comments.target_ref as targetRef",
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
  now: Date = new Date(),
) {
  return executor
    .selectFrom("engagement_likes")
    .select([
      "id",
      "like_state",
      "toggle_window_started_at",
      "toggle_count",
      "capability_expires_at",
    ])
    .where("target_kind", "=", target.kind)
    .where("target_ref", "=", target.ref)
    .where("anonymous_device_hash", "=", anonymousDeviceHash)
    .where("capability_expires_at", ">", now);
}

export function buildInsertAnonymousLikeQuery(
  executor: QueryExecutor,
  input: {
    target: EngagementTarget;
    anonymousDeviceHash: string;
    capabilityExpiresAt: Date;
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
      capability_expires_at: input.capabilityExpiresAt,
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
  now: Date = new Date(),
) {
  return executor
    .selectFrom("engagement_likes")
    .select(({ fn }) => [fn.count<number>("id").as("activeLikeCount")])
    .where("target_kind", "=", target.kind)
    .where("target_ref", "=", target.ref)
    .where("like_state", "=", "active")
    .where("capability_expires_at", ">", now);
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
    .where(publicLaunchSurfacePredicates())
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
        .on("public_entries.public_slug", "is not", null)
        .on(
          publicLaunchSurfacePredicates(
            sql.ref<string | null>("public_entries.content_class"),
          ),
        ),
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
    .where(publicLaunchSurfacePredicates())
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
    .where(publicLaunchSurfacePredicates())
    .groupBy(["journal_topics.slug", "journal_topics.label"]);
}

/**
 * Mirrors the visibility joins used by public community contributions. This is
 * deliberately a comment-target resolver rather than a generic engagement
 * resolver: the contribution UUID must not unlock likes/bookmarks/follows.
 */
export function buildPublicCommunityContributionCommentTargetQuery(
  executor: QueryExecutor,
  contributionId: string,
  viewerScope: RequestScope | null = null,
) {
  return executor
    .selectFrom("community_contributions")
    .innerJoin(
      "communities",
      "communities.id",
      "community_contributions.community_id",
    )
    .innerJoin(
      "journal_entries",
      "journal_entries.id",
      "community_contributions.journal_entry_id",
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
    .innerJoin("community_memberships", (join) =>
      join
        .onRef(
          "community_memberships.community_id",
          "=",
          "community_contributions.community_id",
        )
        .onRef(
          "community_memberships.user_id",
          "=",
          "community_contributions.contributor_user_id",
        ),
    )
    .innerJoin("user_handle_registry", (join) =>
      join
        .onRef(
          "user_handle_registry.user_id",
          "=",
          "journal_entries.owner_user_id",
        )
        .on("user_handle_registry.lifecycle_state", "=", "current"),
    )
    .innerJoin("user_public_profiles", (join) =>
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
      "community_contributions.id as contributionId",
      "community_contributions.discussion_state as discussionState",
      "communities.slug as communitySlug",
    ])
    .where(
      "community_contributions.id",
      "=",
      normalizeCommentId(contributionId),
    )
    .where("communities.lifecycle_state", "in", ["active", "archived"])
    .where("community_contributions.contribution_state", "=", "active")
    .whereRef(
      "community_contributions.contributor_user_id",
      "=",
      "journal_entries.owner_user_id",
    )
    .where("community_memberships.membership_state", "!=", "banned")
    .where("journal_entries.visibility", "=", "public")
    .where("journal_entries.lifecycle_state", "=", "active")
    .where("journal_entries.entry_scope", "=", "object")
    .where("journal_entries.public_gone_at", "is", null)
    .where("journal_entries.public_slug", "is not", null)
    .where("journal_entries.published_at", "is not", null)
    .where(publicLaunchSurfacePredicates())
    .$if(Boolean(viewerScope), (query) =>
      query.where(
        noEngagementBlockPredicate(
          viewerScope!.userId,
          "journal_entries.owner_user_id",
        ),
      ),
    )
    .limit(1);
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

export function normalizeEngagementCommentTarget(
  kindValue: string,
  refValue: string,
): EngagementCommentTarget {
  if (kindValue === "community_contribution") {
    const ref = String(refValue ?? "")
      .trim()
      .toLowerCase();
    if (!UUID_PATTERN.test(ref)) {
      throw new Error("Engagement comment target is not available.");
    }
    return { kind: "community_contribution", ref };
  }
  return normalizeEngagementTarget(kindValue, refValue);
}

export function normalizeEngagementReturnTo(
  value: string | null | undefined,
  target: EngagementCommentTarget,
) {
  return normalizeInternalReturnPath(value, engagementTargetPath(target));
}

export function engagementTargetPath(target: EngagementCommentTarget) {
  switch (target.kind) {
    case "journal_entry":
      return localizedPublicJournalEvidencePath("uk", target.ref);
    case "lineage_object":
      return publicLineageObjectPath(target.ref);
    case "variety":
      return publicVarietyPath(target.ref);
    case "topic":
      return `/topics/${encodeURIComponent(target.ref)}`;
    case "community_contribution":
      // A UUID alone cannot safely reconstruct a locale or community slug.
      // Valid server-rendered return paths are preserved; malformed input gets
      // this neutral same-origin fallback instead.
      return "/";
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
  target: EngagementCommentTarget,
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
  now: Date = new Date(),
) {
  const row = await buildCountActiveEngagementLikesQuery(
    executor,
    target,
    now,
  ).executeTakeFirst();

  return Number(row?.activeLikeCount ?? 0);
}

function nextAnonymousLikeRateWindow(row: EngagementLikeRow, now: Date) {
  const startedAt = new Date(row.toggle_window_started_at);
  const withinWindow =
    Number.isFinite(startedAt.getTime()) &&
    now.getTime() - startedAt.getTime() <= ANONYMOUS_LIKE_WINDOW_MS;

  if (withinWindow && row.toggle_count >= ANONYMOUS_LIKE_WINDOW_LIMIT) {
    throw new InteractionAdmissionError("quota");
  }

  return {
    startedAt: withinWindow ? startedAt : now,
    count: withinWindow ? row.toggle_count + 1 : 1,
  };
}

async function removeExpiredAnonymousLikeRows(
  executor: QueryExecutor,
  target: EngagementTarget,
  now: Date,
) {
  await executor
    .deleteFrom("engagement_likes")
    .where("target_kind", "=", target.kind)
    .where("target_ref", "=", target.ref)
    .where((eb) =>
      eb.or([
        eb("capability_expires_at", "is", null),
        eb("capability_expires_at", "<=", now),
      ]),
    )
    .execute();
}

async function synchronizeAnonymousLikeTargetBudget(
  executor: QueryExecutor,
  target: EngagementTarget,
  now: Date,
) {
  const [active, resident] = await Promise.all([
    countActiveEngagementLikes(target, executor, now),
    executor
      .selectFrom("engagement_likes")
      .select(({ fn }) => [fn.count<number>("id").as("residentLikeCount")])
      .where("target_kind", "=", target.kind)
      .where("target_ref", "=", target.ref)
      .where("capability_expires_at", ">", now)
      .executeTakeFirst(),
  ]);
  const residentLikeCount = Number(resident?.residentLikeCount ?? 0);

  if (active === 0 && residentLikeCount === 0) {
    await executor
      .deleteFrom("engagement_like_target_budgets")
      .where("target_kind", "=", target.kind)
      .where("target_ref", "=", target.ref)
      .execute();
    return { activeLikeCount: 0, residentLikeCount: 0 };
  }

  await executor
    .insertInto("engagement_like_target_budgets")
    .values({
      target_kind: target.kind,
      target_ref: target.ref,
      active_like_count: active,
      resident_like_count: residentLikeCount,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(["target_kind", "target_ref"]).doUpdateSet({
        active_like_count: active,
        resident_like_count: residentLikeCount,
        updated_at: now,
      }),
    )
    .execute();

  return { activeLikeCount: active, residentLikeCount };
}

function assertExistingCommentMatchesInput(
  existing: {
    target_kind: string;
    target_ref: string;
    body: string;
    parent_comment_id: string | null;
  },
  input: {
    target: EngagementCommentTarget;
    body: string;
    parentCommentId: string | null;
  },
) {
  if (
    existing.target_kind !== input.target.kind ||
    existing.target_ref !== input.target.ref ||
    existing.body !== input.body ||
    existing.parent_comment_id !== input.parentCommentId
  ) {
    throw new Error("Comment submission is not available.");
  }
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
        ? // OVE-234: a legacy comment carrying precise location is withheld
          // on read instead of being rendered, notified, or indexed.
          containsPreciseLocationText(row.body)
          ? "Comment is under review."
          : row.body
        : row.commentState === "deleted"
          ? "Comment deleted by its author."
          : "Comment is under review.",
    authorLabel:
      (containsPreciseLocationText(row.authorDisplayName)
        ? null
        : row.authorDisplayName?.trim()) ||
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
  // OVE-234: the keyword pattern above is contact moderation, not the
  // location boundary. The authoritative detector runs before persistence.
  assertNoPreciseLocationText(body, "comment");
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

function normalizeEngagementCommentReportState(
  value: string,
): EngagementCommentReportState {
  if (
    value === "submitted" ||
    value === "reviewed" ||
    value === "dismissed" ||
    value === "actioned"
  ) {
    return value;
  }
  throw new Error("Comment report is not available.");
}

function normalizeEngagementModerationAction(
  value: string,
): EngagementModerationAction {
  if (value === "review" || value === "dismiss" || value === "remove") {
    return value;
  }
  throw new Error("Comment moderation action is not available.");
}

function insertEngagementModerationAudit(
  executor: QueryExecutor,
  input: {
    commentId: string;
    reportId: string;
    actorUserId: string;
    action: EngagementModerationAction;
    reason: string;
    previousState: "submitted" | "reviewed";
    nextState: "reviewed" | "dismissed" | "actioned";
    now: Date;
  },
) {
  return executor
    .insertInto("engagement_moderation_audit_log")
    .values({
      comment_id: input.commentId,
      report_id: input.reportId,
      actor_user_id: input.actorUserId,
      action: input.action,
      reason: normalizeCommentReportReason(input.reason),
      previous_state: input.previousState,
      next_state: input.nextState,
      created_at: input.now,
    })
    .executeTakeFirstOrThrow();
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

function isDatabaseTransaction(
  executor: QueryExecutor,
): executor is Transaction<Database> {
  return "isTransaction" in executor && executor.isTransaction === true;
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
