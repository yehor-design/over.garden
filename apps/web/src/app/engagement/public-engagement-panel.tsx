import { randomUUID } from "node:crypto";

import { ProhibitIcon as Ban } from "@/components/icons/Prohibit";
import { BookmarkSimpleIcon as Bookmark } from "@/components/icons/BookmarkSimple";
import { FlagIcon as Flag } from "@/components/icons/Flag";
import { ChatCircleIcon as MessageCircle } from "@/components/icons/ChatCircle";
import { DotsThreeIcon as MoreHorizontal } from "@/components/icons/DotsThree";
import { ArrowBendUpLeftIcon as Reply } from "@/components/icons/ArrowBendUpLeft";
import { TrashIcon as Trash2 } from "@/components/icons/Trash";
import { UserMinusIcon as UserMinus } from "@/components/icons/UserMinus";
import { UserPlusIcon as UserPlus } from "@/components/icons/UserPlus";
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
import { EngagementBar } from "@/components/ui/engagement-bar";
import { ShareControl } from "./share-control";
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
import { publicProfileBasePath } from "@/lib/garden/public-paths";
import { iconButtonVariants } from "@/components/ui/icon-button";
import { Select } from "@/components/ui/select";

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
  /**
   * The canonical permalink and the title a share sends (`OVE-493`). Built by
   * the route, never read from the address bar, which may carry a return
   * path, a cursor or a sign-in intent.
   */
  share?: { url: string; title: string } | null;
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
        variant="secondary"
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
  share = null,
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
        // The bar owns the arrangement and the one polite live region; each
        // control inside it is still its own Server Action form on a real
        // endpoint (ADR-0024 D3, DESIGN.md §5.6).
        // No `status`: the like control carries the count and the one polite
        // region, because its number is the optimistic one. A second region
        // here would announce twice and print the number twice.
        <EngagementBar label={copy.engagement.barLabel}>
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
              autoFocus={resumeAction === "bookmark"}
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
              variant="secondary"
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
          {/* The row names every thing a reader can do with the entry in one
              place — like, comment, save, share (`OVE-493`, criterion 1). The
              comment itself is written below, where the thread is. */}
          <a
            href="#comment-compose"
            data-engagement-comment-jump="true"
            className={buttonVariants({
              variant: "secondary",
              className: "self-start",
            })}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            {copy.engagement.commentsJump}
          </a>
          {share ? (
            <ShareControl
              url={share.url}
              title={share.title}
              labels={{
                share: copy.engagement.share,
                copied: copy.engagement.shareCopied,
                failed: copy.engagement.shareFailed,
                address: copy.engagement.shareAddress,
              }}
            />
          ) : null}
        </EngagementBar>
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

      <div id="comment-compose" className="grid scroll-mt-20 gap-3">
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
              sending: copy.engagement.sending,
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
      </div>

      {threads.length === 0 ? (
        <p className="text-body-sm text-text-muted">
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
            // One box per thread, and every Reply in the thread leads to it.
            // That is the flatten (`OVE-454`, criterion 3): a reply to a reply
            // joins the same thread at the same level rather than opening a
            // third, and no reader is offered a depth the server refuses.
            const replyFieldId = isResumedReply
              ? buildAuthIntentAnchor("comment", replyControl)
              : `engagement-${replyControl}`;

            return (
              <li
                key={root.key}
                className="grid gap-3 rounded-lg border border-border p-3"
              >
                <Comment
                  comment={root}
                  locale={locale}
                  isAuthenticated={isAuthenticated}
                  target={target}
                  returnTo={returnTo}
                  replyFieldId={
                    isActiveComment(root) && isAuthenticated
                      ? replyFieldId
                      : null
                  }
                  replyLabel={copy.engagement.reply}
                  permalinkLabel={copy.engagement.commentPermalink}
                  resumeAction={resumeAction}
                  resumeControl={resumeControl}
                />

                {replies.length > 0 ? (
                  <ol className="grid gap-3 border-l border-border pl-4">
                    {replies.map((reply) => (
                      <li key={reply.key}>
                        <Comment
                          comment={reply}
                          locale={locale}
                          isAuthenticated={isAuthenticated}
                          target={target}
                          returnTo={returnTo}
                          replyFieldId={
                            isActiveComment(root) && isAuthenticated
                              ? replyFieldId
                              : null
                          }
                          replyLabel={copy.engagement.reply}
                          permalinkLabel={copy.engagement.commentPermalink}
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
                    fieldId={replyFieldId}
                    autoFocus={isResumedReply}
                    replyTarget={copy.engagement.replyTo.replace(
                      "{author}",
                      root.authorLabel,
                    )}
                    labels={{
                      field: copy.engagement.reply,
                      action: copy.engagement.reply,
                      sending: copy.engagement.sending,
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
                    variant="secondary"
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
            variant: "secondary",
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

/**
 * One comment: who wrote it, when, what it says, and a link to itself.
 *
 * The anchor is the "individually addressable" half of `OVE-454` criterion 3 —
 * a reader can send somebody a link to the comment rather than to the page it
 * is somewhere on — and `scroll-mt` keeps the target clear of the sticky
 * header when they follow one.
 */
function Comment({
  comment,
  locale,
  isAuthenticated,
  target,
  returnTo,
  replyFieldId,
  replyLabel,
  permalinkLabel,
  resumeAction,
  resumeControl,
}: {
  comment: PublicEngagementComment;
  locale: InterfaceLocale;
  isAuthenticated: boolean;
  target: EngagementCommentTarget;
  returnTo: string;
  /** The thread's one reply box, or null when there is nothing to reply into. */
  replyFieldId: string | null;
  replyLabel: string;
  permalinkLabel: string;
  resumeAction: AuthIntentAction | null;
  resumeControl: string | null;
}) {
  const anchor = commentAnchorId(
    createAuthIntentControlRef("reply", comment.replyToken),
  );
  return (
    <article id={anchor} className="grid scroll-mt-20 gap-2">
      <CommentHeader comment={comment} locale={locale} anchor={anchor} />
      {isActiveComment(comment) ? (
        <p className="text-body-sm whitespace-pre-wrap text-text">
          {comment.body}
        </p>
      ) : (
        // What happened to a comment, in the reader's language — never the
        // repository's English placeholder (`OVE-493`, criterion 3).
        <p
          data-comment-state={comment.state}
          className="text-body-sm text-text-muted italic"
        >
          {comment.state === "deleted"
            ? getPublicSurfaceCopy(locale).engagement.commentRemovedByAuthor
            : getPublicSurfaceCopy(locale).engagement.commentUnderReview}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {replyFieldId && isActiveComment(comment) ? (
          <a
            href={`#${replyFieldId}`}
            className="text-link hover:text-link-hover rounded-sm text-caption underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {replyLabel}
          </a>
        ) : null}
        <a
          href={`#${anchor}`}
          className="rounded-sm text-caption text-text-muted underline underline-offset-4 outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {permalinkLabel}
        </a>
        <CommentActions
          comment={comment}
          isAuthenticated={isAuthenticated}
          locale={locale}
          target={target}
          returnTo={returnTo}
          resumeAction={resumeAction}
          resumeControl={resumeControl}
        />
      </div>
    </article>
  );
}

function CommentHeader({
  comment,
  locale,
  anchor,
}: {
  comment: PublicEngagementComment;
  locale: InterfaceLocale;
  anchor: string;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
      <p className="text-body-sm font-medium text-text-heading">
        {comment.authorHandle ? (
          <Link href={publicProfileBasePath(comment.authorHandle)}>
            {comment.authorLabel}
          </Link>
        ) : (
          comment.authorLabel
        )}
      </p>
      <time
        dateTime={isoDate(comment.createdAt)}
        data-comment-anchor={anchor}
        className="text-caption text-text-muted"
      >
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
        className={iconButtonVariants({
          variant: "ghost",
          className: "cursor-pointer list-none",
        })}
      >
        <MoreHorizontal className="size-4" />
        <span className="sr-only">{copy.engagement.moreActions}</span>
      </summary>
      <div className="absolute top-full left-0 z-popover mt-1 grid min-w-56 gap-2 border border-border bg-popover p-2 text-popover-foreground shadow-md">
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
              <Select
                name="reason"
                size="sm"
                defaultValue="other"
                aria-label={copy.engagement.reportComment}
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
              </Select>
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

/**
 * A thread is two levels deep, and nothing is lost getting there (`OVE-454`).
 *
 * The previous shape filed a reply under `parentReplyToken` and then only ever
 * read the map at a **root's** token, so a comment whose parent was itself a
 * reply was silently absent from the page — present in the database, counted,
 * and invisible. Today the server cannot store one (`addEngagementComment`
 * admits a reply only under a root, and `EngagementCommentForm` below posts a
 * root's token whichever comment the reader pressed Reply on), but a renderer
 * that drops a row it does not recognise is a defect waiting for the first
 * shape it has not met.
 *
 * So: a comment whose parent is not among the loaded comments is a root, and a
 * comment whose parent is a reply joins that reply's own root. Depth is capped
 * at two by construction rather than by hoping the input is well formed.
 */
export function buildCommentThreads(comments: PublicEngagementComment[]) {
  const byToken = new Map(
    comments.map((comment) => [comment.replyToken, comment]),
  );

  /** The root this comment belongs under, following at most a few parents. */
  const rootTokenOf = (comment: PublicEngagementComment) => {
    let current = comment;
    for (let hop = 0; hop < 8; hop += 1) {
      const parentToken = current.parentReplyToken;
      if (!parentToken) return current.replyToken;
      const parent = byToken.get(parentToken);
      // The parent is not on this page: this comment opens a thread of its own
      // rather than vanishing.
      if (!parent || parent.replyToken === current.replyToken) {
        return current.replyToken;
      }
      current = parent;
    }
    return current.replyToken;
  };

  const roots = comments.filter(
    (comment) => rootTokenOf(comment) === comment.replyToken,
  );
  const repliesByRoot = new Map<string, PublicEngagementComment[]>();
  for (const comment of comments) {
    const rootToken = rootTokenOf(comment);
    if (rootToken === comment.replyToken) continue;
    const replies = repliesByRoot.get(rootToken) ?? [];
    replies.push(comment);
    repliesByRoot.set(rootToken, replies);
  }
  return roots.map((root) => ({
    root,
    replies: repliesByRoot.get(root.replyToken) ?? [],
  }));
}

/**
 * Every comment is a place a reader can link to (`OVE-454`, criterion 3) —
 * and the address is the comment's **opaque** control ref, never its id.
 *
 * A comment id is a capability here: `createAuthIntentControlRef` exists so a
 * guest's sign-in round trip can name a control without the page ever printing
 * the row it refers to, and `public-engagement-panel.test.tsx` asserts a
 * guest's rendered thread contains no raw token. An anchor built from the id
 * would have undone that quietly, in an `href` nobody would look at twice.
 */
export function commentAnchorId(controlRef: string) {
  return `comment-${controlRef}`;
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

function isoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatDate(value: Date | string, locale: InterfaceLocale) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
