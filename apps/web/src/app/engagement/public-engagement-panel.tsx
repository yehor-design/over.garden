import { Bookmark, Heart, MessageCircle, Reply } from "lucide-react";
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
  PublicEngagementSummary,
} from "@/server/engagement-repository";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";

interface PublicEngagementPanelProps {
  isAuthenticated: boolean;
  locale: InterfaceLocale;
  target: EngagementTarget;
  summary: PublicEngagementSummary;
  returnTo: string;
  status?: string | null;
  resumeAction?: AuthIntentAction | null;
  resumeControl?: string | null;
}

export function PublicEngagementPanel({
  isAuthenticated,
  locale,
  target,
  summary,
  returnTo,
  status,
  resumeAction = null,
  resumeControl = null,
}: PublicEngagementPanelProps) {
  const copy = getPublicSurfaceCopy(locale);
  const intentTarget = engagementAuthIntentTarget(target);

  return (
    <section
      id="comments"
      data-auth-intent-resumed={resumeAction ?? undefined}
      className="grid gap-4 border-y border-border py-5"
    >
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
              target={target}
              returnTo={returnTo}
              label={copy.engagement.bookmark}
              icon={<Bookmark className="size-4" />}
              variant="outline"
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
        </div>
        <p className="text-sm text-muted-foreground">
          {formatPublicCount(locale, "like", summary.activeLikeCount)}
        </p>
      </div>

      {status ? (
        <p className="text-sm text-muted-foreground">
          {engagementStatusMessage(status, locale)}
        </p>
      ) : null}

      {resumeAction === "comment" || resumeAction === "bookmark" ? (
        <p className="text-sm font-medium text-foreground" role="status">
          Sign-in complete. Confirm the action below to continue.
        </p>
      ) : null}

      {isAuthenticated ? (
        <form
          method="post"
          action="/api/engagement/comments"
          className="grid gap-3"
        >
          <EngagementTargetFields target={target} returnTo={returnTo} />
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

      {summary.comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {copy.engagement.noComments}
        </p>
      ) : (
        <ol className="grid gap-3">
          {summary.comments.map((comment) => {
            const replyControl = createAuthIntentControlRef(
              "reply",
              comment.replyToken,
            );
            const isResumedReply =
              resumeAction === "comment" && resumeControl === replyControl;

            return (
              <li
                key={comment.key}
                className="grid gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <p className="text-sm font-medium text-foreground">
                    {comment.authorLabel}
                  </p>
                  <time className="text-xs text-muted-foreground">
                    {formatDate(comment.createdAt, locale)}
                  </time>
                </div>
                {comment.parentReplyToken ? (
                  <p className="text-xs text-muted-foreground">
                    {copy.engagement.reply}
                  </p>
                ) : null}
                <p className="text-sm leading-6 whitespace-pre-wrap text-foreground">
                  {comment.body}
                </p>
                {isAuthenticated ? (
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
                      value={comment.replyToken}
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
                ) : (
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
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
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
}: {
  action: string;
  target: EngagementTarget;
  returnTo: string;
  label: string;
  icon: ReactNode;
  variant?: "outline";
  intentAction?: AuthIntentAction;
  autoFocus?: boolean;
}) {
  return (
    <form method="post" action={action}>
      <EngagementTargetFields target={target} returnTo={returnTo} />
      <button
        id={intentAction === "bookmark" ? "engagement-bookmark" : undefined}
        data-auth-intent-control={intentAction}
        autoFocus={autoFocus}
        type="submit"
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
  target: EngagementTarget,
): AuthIntentTarget {
  if (target.kind === "journal_entry") {
    return { kind: "journal", ref: target.ref };
  }
  if (target.kind === "lineage_object") {
    return { kind: "object", ref: target.ref };
  }
  return { kind: "collection", ref: target.ref };
}

function EngagementTargetFields({
  target,
  returnTo,
}: {
  target: EngagementTarget;
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

function engagementStatusMessage(status: string, locale: InterfaceLocale) {
  const copy = getPublicSurfaceCopy(locale);

  switch (status) {
    case "liked":
      return copy.engagement.liked;
    case "unliked":
      return copy.engagement.unliked;
    case "like-rate-limited":
      return copy.engagement.likeRateLimited;
    case "bookmarked":
      return copy.engagement.bookmarked;
    case "bookmark-removed":
      return copy.engagement.bookmarkRemoved;
    case "commented":
      return copy.engagement.commented;
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
