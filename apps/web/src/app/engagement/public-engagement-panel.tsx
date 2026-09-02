import { randomUUID } from "node:crypto";

import {
  Ban,
  Bookmark,
  Flag,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Reply,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import { buttonVariants } from "@/components/ui/button";
import type {
  AuthIntentAction,
  AuthIntentTarget,
} from "@/lib/auth/auth-intent-contract";
import { buildAuthIntentAnchor } from "@/lib/auth/auth-intent-contract";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatPublicCount,
  getPublicSurfaceCopy,
} from "@/lib/public-surface-localization";
import type {
  EngagementTarget,
  EngagementCommentTarget,
  PublicEngagementCommentThread,
  PublicEngagementSummary,
  PublicEngagementComment,
} from "@/server/engagement-repository";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";

interface PublicEngagementPanelProps {
  isAuthenticated: boolean;
  locale: InterfaceLocale;
  target: EngagementCommentTarget;
  summary: PublicEngagementSummary | PublicEngagementCommentThread;
  returnTo: string;
  commentOnly?: boolean;
  status?: string | null;
  resumeAction?: AuthIntentAction | null;
  resumeControl?: string | null;
}

export function EngagementFollowControl({
  isAuthenticated,
  locale,
  target,
  returnTo,
  following = false,
  resumeAction = null,
}: {
  isAuthenticated: boolean;
  locale: InterfaceLocale;
  target: EngagementTarget & { kind: "lineage_object" | "topic" };
  returnTo: string;
  following?: boolean;
  resumeAction?: AuthIntentAction | null;
}) {
  const copy = getPublicSurfaceCopy(locale);
  const label = following ? copy.engagement.unfollow : copy.engagement.follow;
  const icon = following ? (
    <UserMinus className="size-4" />
  ) : (
    <UserPlus className="size-4" />
  );

  if (!isAuthenticated) {
    return (
      <AuthIntentTrigger
        action="follow"
        returnTo={returnTo}
        target={engagementAuthIntentTarget(target)}
        label={label}
        icon={icon}
        variant="outline"
      />
    );
  }

  return (
    <EngagementButtonForm
      action="/api/engagement/follows"
      intentAction="follow"
      target={target}
      returnTo={returnTo}
      label={label}
      icon={icon}
      variant="outline"
      stateName="followState"
      stateValue={following ? "removed" : "active"}
      pressed={following}
      autoFocus={resumeAction === "follow"}
    />
  );
}

export function PublicEngagementPanel({
  isAuthenticated,
  locale,
  target,
  summary,
  returnTo,
  status,
  commentOnly = false,
  resumeAction = null,
  resumeControl = null,
}: PublicEngagementPanelProps) {
  const copy = getPublicSurfaceCopy(locale);
  const intentTarget = engagementAuthIntentTarget(target);
  const threads = buildCommentThreads(summary.comments);

  return (
    <section
      id="comments"
      data-auth-intent-resumed={resumeAction ?? undefined}
      className="grid gap-4 border-y border-border py-5"
    >
      {!commentOnly ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <EngagementButtonForm
              action="/api/engagement/likes"
              target={target}
              returnTo={returnTo}
              label={copy.engagement.like}
              icon={<Heart className="size-4" />}
            />
            {isAuthenticated ? (
              <EngagementButtonForm
                action="/api/engagement/bookmarks"
                intentAction="bookmark"
                target={{ kind: target.kind, ref: target.ref }}
                returnTo={returnTo}
                label={copy.engagement.bookmark}
                icon={<Bookmark className="size-4" />}
                variant="outline"
                stateName="bookmarkState"
                stateValue={
                  "viewerBookmarked" in summary && summary.viewerBookmarked
                    ? "removed"
                    : "active"
                }
                pressed={
                  "viewerBookmarked" in summary &&
                  Boolean(summary.viewerBookmarked)
                }
                autoFocus={resumeAction === "bookmark"}
              />
            ) : (
              <AuthIntentTrigger
                action="bookmark"
                returnTo={returnTo}
                target={intentTarget}
                label={copy.engagement.bookmark}
                icon={<Bookmark className="size-4" />}
                variant="outline"
              />
            )}
            {target.kind === "lineage_object" || target.kind === "topic" ? (
              <EngagementFollowControl
                isAuthenticated={isAuthenticated}
                locale={locale}
                target={{ kind: target.kind, ref: target.ref }}
                returnTo={returnTo}
                following={
                  "viewerFollowing" in summary && summary.viewerFollowing
                }
                resumeAction={resumeControl ? null : resumeAction}
              />
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground" role="status">
            {formatPublicCount(
              locale,
              "like",
              "activeLikeCount" in summary ? summary.activeLikeCount : 0,
            )}
          </p>
        </div>
      ) : null}

      {status ? (
        <p className="text-sm text-muted-foreground">
          {engagementStatusMessage(status, locale)}
        </p>
      ) : null}

      {resumeAction === "comment" ||
      resumeAction === "bookmark" ||
      resumeAction === "follow" ||
      resumeAction === "report" ||
      resumeAction === "block" ? (
        <p className="text-sm font-medium text-foreground" role="status">
          {copy.engagement.signInComplete}
        </p>
      ) : null}

      {isAuthenticated ? (
        <form
          method="post"
          action="/api/engagement/comments"
          className="grid gap-3"
        >
          <EngagementTargetFields target={target} returnTo={returnTo} />
          <input type="hidden" name="clientMutationId" value={randomUUID()} />
          <label className="grid gap-2 text-sm font-medium text-foreground">
            {copy.engagement.comment}
            <textarea
              id="engagement-comment"
              data-auth-intent-control="comment"
              autoFocus={resumeAction === "comment" && !resumeControl}
              name="body"
              maxLength={600}
              rows={3}
              className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground shadow-sm transition-colors outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </label>
          <button
            type="submit"
            className={buttonVariants({ className: "self-start" })}
          >
            <MessageCircle className="size-4" />
            {copy.engagement.comment}
          </button>
        </form>
      ) : (
        <AuthIntentTrigger
          action="comment"
          returnTo={returnTo}
          target={intentTarget}
          label={copy.engagement.comment}
          icon={<MessageCircle className="size-4" />}
          className="w-fit"
        />
      )}

      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {copy.engagement.noComments}
        </p>
      ) : (
        <ol className="grid gap-3">
          {threads.map(({ root, replies }) => {
            const replyControl = createAuthIntentControlRef(
              "reply",
              root.replyToken,
            );
            const isResumedReply =
              resumeAction === "comment" && resumeControl === replyControl;

            return (
              <li
                key={root.key}
                className="grid gap-3 rounded-lg border border-border p-3"
              >
                <CommentHeader comment={root} locale={locale} />
                <p className="text-sm leading-6 whitespace-pre-wrap text-foreground">
                  {root.body}
                </p>
                <CommentActions
                  comment={root}
                  isAuthenticated={isAuthenticated}
                  locale={locale}
                  target={target}
                  returnTo={returnTo}
                  resumeAction={resumeAction}
                  resumeControl={resumeControl}
                />

                {replies.length > 0 ? (
                  <ol className="grid gap-3 border-l border-border pl-4">
                    {replies.map((reply) => (
                      <li key={reply.key} className="grid gap-2">
                        <CommentHeader comment={reply} locale={locale} />
                        <p className="text-sm leading-6 whitespace-pre-wrap text-foreground">
                          {reply.body}
                        </p>
                        <CommentActions
                          comment={reply}
                          isAuthenticated={isAuthenticated}
                          locale={locale}
                          target={target}
                          returnTo={returnTo}
                          resumeAction={resumeAction}
                          resumeControl={resumeControl}
                        />
                      </li>
                    ))}
                  </ol>
                ) : null}

                {isActiveComment(root) && isAuthenticated ? (
                  <form
                    method="post"
                    action="/api/engagement/comments"
                    className="grid gap-2"
                  >
                    <EngagementTargetFields
                      target={target}
                      returnTo={returnTo}
                    />
                    <input
                      type="hidden"
                      name="parentCommentId"
                      value={root.replyToken}
                    />
                    <input
                      type="hidden"
                      name="clientMutationId"
                      value={randomUUID()}
                    />
                    <label className="grid gap-2 text-sm font-medium text-foreground">
                      {copy.engagement.reply}
                      <textarea
                        id={
                          isResumedReply
                            ? buildAuthIntentAnchor("comment", replyControl)
                            : undefined
                        }
                        data-auth-intent-control="comment"
                        data-auth-intent-control-ref={replyControl}
                        autoFocus={isResumedReply}
                        name="body"
                        maxLength={600}
                        rows={2}
                        className="min-h-16 rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground shadow-sm transition-colors outline-none placeholder:text-muted-foreground focus:border-primary"
                      />
                    </label>
                    <button
                      type="submit"
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "self-start",
                      })}
                    >
                      <Reply className="size-4" />
                      {copy.engagement.reply}
                    </button>
                  </form>
                ) : isActiveComment(root) ? (
                  <AuthIntentTrigger
                    action="comment"
                    returnTo={returnTo}
                    target={intentTarget}
                    control={replyControl}
                    label={copy.engagement.reply}
                    icon={<Reply className="size-4" />}
                    variant="outline"
                    size="sm"
                    className="w-fit"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {summary.hasMoreComments && summary.nextCommentCursor ? (
        <Link
          href={appendCommentCursor(returnTo, summary.nextCommentCursor)}
          className={buttonVariants({
            variant: "outline",
            className: "w-fit",
          })}
        >
          <MessageCircle className="size-4" />
          {copy.engagement.showMoreComments}
        </Link>
      ) : null}
    </section>
  );
}

function CommentHeader({
  comment,
  locale,
}: {
  comment: PublicEngagementComment;
  locale: InterfaceLocale;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
      <p className="text-sm font-medium text-foreground">
        {comment.authorHandle ? (
          <Link href={`/@${comment.authorHandle}`}>{comment.authorLabel}</Link>
        ) : (
          comment.authorLabel
        )}
      </p>
      <time className="text-xs text-muted-foreground">
        {formatDate(comment.createdAt, locale)}
      </time>
    </div>
  );
}

function CommentActions({
  comment,
  isAuthenticated,
  locale,
  target,
  returnTo,
  resumeAction,
  resumeControl,
}: {
  comment: PublicEngagementComment;
  isAuthenticated: boolean;
  locale: InterfaceLocale;
  target: EngagementCommentTarget;
  returnTo: string;
  resumeAction: AuthIntentAction | null;
  resumeControl: string | null;
}) {
  if (comment.state && comment.state !== "active") return null;
  const copy = getPublicSurfaceCopy(locale);

  if (comment.isOwn && isAuthenticated) {
    return (
      <form method="post" action="/api/engagement/comments/delete">
        <EngagementTargetFields target={target} returnTo={returnTo} />
        <input type="hidden" name="commentId" value={comment.replyToken} />
        <button
          type="submit"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <Trash2 className="size-4" />
          {copy.engagement.deleteComment}
        </button>
      </form>
    );
  }

  const reportControl = createAuthIntentControlRef(
    "report",
    comment.replyToken,
  );
  const blockControl = createAuthIntentControlRef("block", comment.replyToken);
  const resumed =
    (resumeAction === "report" && resumeControl === reportControl) ||
    (resumeAction === "block" && resumeControl === blockControl);

  return (
    <details
      open={resumed}
      className="relative w-fit"
      id={
        resumed && resumeAction
          ? buildAuthIntentAnchor(resumeAction, resumeControl)
          : undefined
      }
    >
      <summary
        title={copy.engagement.moreActions}
        className={buttonVariants({
          variant: "ghost",
          size: "icon",
          className: "cursor-pointer list-none",
        })}
      >
        <MoreHorizontal className="size-4" />
        <span className="sr-only">{copy.engagement.moreActions}</span>
      </summary>
      <div className="absolute top-full left-0 z-20 mt-1 grid min-w-56 gap-2 border border-border bg-popover p-2 text-popover-foreground shadow-md">
        {isAuthenticated ? (
          <>
            <form
              method="post"
              action="/api/engagement/comments/report"
              className="grid gap-2"
            >
              <EngagementTargetFields target={target} returnTo={returnTo} />
              <input
                type="hidden"
                name="commentId"
                value={comment.replyToken}
              />
              <select
                name="reason"
                defaultValue="other"
                aria-label={copy.engagement.reportComment}
                className="h-9 border border-border bg-background px-2 text-sm"
              >
                <option value="spam">
                  {copy.engagement.reportReasons.spam}
                </option>
                <option value="harassment">
                  {copy.engagement.reportReasons.harassment}
                </option>
                <option value="privacy">
                  {copy.engagement.reportReasons.privacy}
                </option>
                <option value="misinformation">
                  {copy.engagement.reportReasons.misinformation}
                </option>
                <option value="other">
                  {copy.engagement.reportReasons.other}
                </option>
              </select>
              <button
                type="submit"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <Flag className="size-4" />
                {copy.engagement.reportComment}
              </button>
            </form>
            <form method="post" action="/api/engagement/comments/block">
              <EngagementTargetFields target={target} returnTo={returnTo} />
              <input
                type="hidden"
                name="commentId"
                value={comment.replyToken}
              />
              <button
                type="submit"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <Ban className="size-4" />
                {copy.engagement.blockAuthor}
              </button>
            </form>
          </>
        ) : (
          <>
            <AuthIntentTrigger
              action="report"
              returnTo={returnTo}
              target={engagementAuthIntentTarget(target)}
              control={reportControl}
              label={copy.engagement.reportComment}
              icon={<Flag className="size-4" />}
              variant="ghost"
              size="sm"
            />
            <AuthIntentTrigger
              action="block"
              returnTo={returnTo}
              target={engagementAuthIntentTarget(target)}
              control={blockControl}
              label={copy.engagement.blockAuthor}
              icon={<Ban className="size-4" />}
              variant="ghost"
              size="sm"
            />
          </>
        )}
      </div>
    </details>
  );
}

function EngagementButtonForm({
  action,
  target,
  returnTo,
  label,
  icon,
  variant,
  intentAction,
  autoFocus = false,
  stateName,
  stateValue,
  pressed,
}: {
  action: string;
  target: EngagementCommentTarget;
  returnTo: string;
  label: string;
  icon: ReactNode;
  variant?: "outline";
  intentAction?: AuthIntentAction;
  autoFocus?: boolean;
  stateName?: string;
  stateValue?: string;
  pressed?: boolean;
}) {
  return (
    <form method="post" action={action}>
      <EngagementTargetFields target={target} returnTo={returnTo} />
      {stateName && stateValue ? (
        <input type="hidden" name={stateName} value={stateValue} />
      ) : null}
      <button
        id={
          intentAction === "bookmark"
            ? "engagement-bookmark"
            : intentAction === "follow" && autoFocus
              ? "lineage-follow"
              : undefined
        }
        data-auth-intent-control={intentAction}
        autoFocus={autoFocus}
        type="submit"
        aria-pressed={pressed}
        className={buttonVariants({
          variant,
          className: "self-start",
        })}
      >
        {icon}
        {label}
      </button>
    </form>
  );
}

function engagementAuthIntentTarget(
  target: EngagementCommentTarget,
): AuthIntentTarget {
  if (target.kind === "journal_entry") {
    return { kind: "journal", ref: target.ref };
  }
  if (target.kind === "lineage_object") {
    return { kind: "object", ref: target.ref };
  }
  if (target.kind === "community_contribution") {
    return { kind: "contribution", ref: target.ref };
  }
  return { kind: "collection", ref: target.ref };
}

function EngagementTargetFields({
  target,
  returnTo,
}: {
  target: EngagementCommentTarget;
  returnTo: string;
}) {
  return (
    <>
      <input type="hidden" name="targetKind" value={target.kind} />
      <input type="hidden" name="targetRef" value={target.ref} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
}

function buildCommentThreads(comments: PublicEngagementComment[]) {
  const roots = comments.filter((comment) => !comment.parentReplyToken);
  const repliesByRoot = new Map<string, PublicEngagementComment[]>();
  for (const comment of comments) {
    if (!comment.parentReplyToken) continue;
    const replies = repliesByRoot.get(comment.parentReplyToken) ?? [];
    replies.push(comment);
    repliesByRoot.set(comment.parentReplyToken, replies);
  }
  return roots.map((root) => ({
    root,
    replies: repliesByRoot.get(root.replyToken) ?? [],
  }));
}

function isActiveComment(comment: PublicEngagementComment) {
  return !comment.state || comment.state === "active";
}

function appendCommentCursor(returnTo: string, cursor: string) {
  const url = new URL(returnTo, "https://over.garden");
  url.searchParams.set("cursor", cursor);
  url.hash = "comments";
  return `${url.pathname}${url.search}${url.hash}`;
}

function engagementStatusMessage(status: string, locale: InterfaceLocale) {
  const copy = getPublicSurfaceCopy(locale);

  switch (status) {
    case "liked":
      return copy.engagement.liked;
    case "unliked":
      return copy.engagement.unliked;
    case "like-rate-limited":
      return copy.engagement.likeRateLimited;
    case "comment-rate-limited":
      return copy.engagement.commentRateLimited;
    case "interaction-unavailable":
      return copy.engagement.interactionUnavailable;
    case "bookmarked":
      return copy.engagement.bookmarked;
    case "bookmark-removed":
      return copy.engagement.bookmarkRemoved;
    case "commented":
      return copy.engagement.commented;
    case "followed":
      return copy.engagement.followed;
    case "unfollowed":
      return copy.engagement.unfollowed;
    case "comment-deleted":
      return copy.engagement.commentDeleted;
    case "comment-reported":
      return copy.engagement.commentReported;
    case "comment-author-blocked":
      return copy.engagement.commentAuthorBlocked;
    case "comment-unavailable":
      return copy.engagement.commentUnavailable;
    default:
      return "";
  }
}

function formatDate(value: Date | string, locale: InterfaceLocale) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
