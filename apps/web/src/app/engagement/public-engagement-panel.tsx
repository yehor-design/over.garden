import { randomUUID } from "node:crypto";

import {
  Ban,
  Bookmark,
  Flag,
  MessageCircle,
  MoreHorizontal,
  Reply,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import Link from "next/link";

import { AuthIntentTrigger } from "@/components/auth/auth-intent-trigger";
import {
  addCommentAction,
  blockCommentAuthorAction,
  deleteCommentAction,
  reportCommentAction,
  setBookmarkAction,
  setFollowAction,
  toggleLikeAction,
} from "./engagement-actions";
import {
  EngagementBookmarkControl,
  EngagementCommentForm,
  EngagementCommentActionButton,
  EngagementFollowToggleControl,
  EngagementLikeControl,
} from "./engagement-controls";
import type { ViewerLikeState } from "./engagement-viewer";
import { buttonVariants } from "@/components/ui/button";
import type {
  AuthIntentAction,
  AuthIntentTarget,
} from "@/lib/auth/auth-intent-contract";
import { buildAuthIntentAnchor } from "@/lib/auth/auth-intent-contract";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
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
  /**
   * The count and whether this reader already liked the target. Resolved by the
   * page beside its other reads, never inside this component: the panel renders
   * on five surfaces and a hidden database read in a shared renderer is how a
   * page loses track of what it costs.
   */
  likeState?: ViewerLikeState | null;
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
    <EngagementFollowToggleControl
      targetKind={target.kind}
      targetRef={target.ref}
      initialActive={following}
      autoFocus={resumeAction === "follow"}
      labels={{
        inactive: copy.engagement.follow,
        active: copy.engagement.unfollow,
        unavailable: copy.engagement.interactionUnavailable,
        rateLimited: copy.engagement.likeRateLimited,
        signInRequired: copy.engagement.interactionUnavailable,
      }}
      submit={setFollowAction}
    />
  );
}

export function PublicEngagementPanel({
  isAuthenticated,
  locale,
  target,
  summary,
  returnTo,
  commentOnly = false,
  likeState = null,
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
      {!commentOnly && likeState ? (
        <div className="flex flex-wrap items-start gap-3">
          <EngagementLikeControl
            targetKind={target.kind}
            targetRef={target.ref}
            initialLiked={likeState.viewerLiked}
            initialCount={likeState.activeLikeCount}
            locale={locale}
            labels={{
              like: copy.engagement.like,
              liked: copy.engagement.likeActive,
              unavailable: copy.engagement.interactionUnavailable,
              rateLimited: copy.engagement.likeRateLimited,
            }}
            toggle={toggleLikeAction}
          />
          {isAuthenticated ? (
            <EngagementBookmarkControl
              targetKind={target.kind}
              targetRef={target.ref}
              initialActive={
                "viewerBookmarked" in summary &&
                Boolean(summary.viewerBookmarked)
              }
              labels={{
                inactive: copy.engagement.bookmark,
                active: copy.engagement.bookmarkActive,
                unavailable: copy.engagement.interactionUnavailable,
                rateLimited: copy.engagement.likeRateLimited,
                signInRequired: copy.engagement.interactionUnavailable,
              }}
              submit={setBookmarkAction}
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
        <EngagementCommentForm
          targetKind={target.kind}
          targetRef={target.ref}
          clientMutationId={randomUUID()}
          fieldId="engagement-comment"
          autoFocus={resumeAction === "comment" && !resumeControl}
          labels={{
            field: copy.engagement.comment,
            action: copy.engagement.comment,
            unavailable: copy.engagement.interactionUnavailable,
            rateLimited: copy.engagement.commentRateLimited,
            signInRequired: copy.engagement.interactionUnavailable,
          }}
          submit={addCommentAction}
        />
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
                  <EngagementCommentForm
                    targetKind={target.kind}
                    targetRef={target.ref}
                    parentCommentId={root.replyToken}
                    clientMutationId={randomUUID()}
                    compact
                    controlRef={replyControl}
                    fieldId={
                      isResumedReply
                        ? buildAuthIntentAnchor("comment", replyControl)
                        : undefined
                    }
                    autoFocus={isResumedReply}
                    labels={{
                      field: copy.engagement.reply,
                      action: copy.engagement.reply,
                      unavailable: copy.engagement.interactionUnavailable,
                      rateLimited: copy.engagement.commentRateLimited,
                      signInRequired: copy.engagement.interactionUnavailable,
                    }}
                    submit={addCommentAction}
                  />
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
      <EngagementCommentActionButton
        targetKind={target.kind}
        targetRef={target.ref}
        commentId={comment.replyToken}
        label={copy.engagement.deleteComment}
        icon={<Trash2 className="size-4" aria-hidden="true" />}
        labels={{
          unavailable: copy.engagement.interactionUnavailable,
          rateLimited: copy.engagement.commentRateLimited,
          signInRequired: copy.engagement.interactionUnavailable,
        }}
        submit={deleteCommentAction}
      />
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
            <EngagementCommentActionButton
              targetKind={target.kind}
              targetRef={target.ref}
              commentId={comment.replyToken}
              label={copy.engagement.reportComment}
              icon={<Flag className="size-4" aria-hidden="true" />}
              labels={{
                unavailable: copy.engagement.interactionUnavailable,
                rateLimited: copy.engagement.commentRateLimited,
                signInRequired: copy.engagement.interactionUnavailable,
              }}
              submit={reportCommentAction}
            >
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
            </EngagementCommentActionButton>
            <EngagementCommentActionButton
              targetKind={target.kind}
              targetRef={target.ref}
              commentId={comment.replyToken}
              label={copy.engagement.blockAuthor}
              icon={<Ban className="size-4" aria-hidden="true" />}
              labels={{
                unavailable: copy.engagement.interactionUnavailable,
                rateLimited: copy.engagement.commentRateLimited,
                signInRequired: copy.engagement.interactionUnavailable,
              }}
              submit={blockCommentAuthorAction}
            />
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

function formatDate(value: Date | string, locale: InterfaceLocale) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
