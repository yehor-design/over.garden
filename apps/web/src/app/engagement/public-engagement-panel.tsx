import { Bookmark, Heart, MessageCircle, Reply } from "lucide-react";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatPublicCount,
  getPublicSurfaceCopy,
} from "@/lib/public-surface-localization";
import type {
  EngagementTarget,
  PublicEngagementSummary,
} from "@/server/engagement-repository";

interface PublicEngagementPanelProps {
  locale: InterfaceLocale;
  target: EngagementTarget;
  summary: PublicEngagementSummary;
  returnTo: string;
  status?: string | null;
}

export function PublicEngagementPanel({
  locale,
  target,
  summary,
  returnTo,
  status,
}: PublicEngagementPanelProps) {
  const copy = getPublicSurfaceCopy(locale);

  return (
    <section className="grid gap-4 border-y border-border py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <EngagementButtonForm
            action="/api/engagement/likes"
            target={target}
            returnTo={returnTo}
            label={copy.engagement.like}
            icon={<Heart className="size-4" />}
          />
          <EngagementButtonForm
            action="/api/engagement/bookmarks"
            target={target}
            returnTo={returnTo}
            label={copy.engagement.bookmark}
            icon={<Bookmark className="size-4" />}
            variant="outline"
          />
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

      <form
        method="post"
        action="/api/engagement/comments"
        className="grid gap-3"
      >
        <EngagementTargetFields target={target} returnTo={returnTo} />
        <label className="grid gap-2 text-sm font-medium text-foreground">
          {copy.engagement.comment}
          <textarea
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

      {summary.comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {copy.engagement.noComments}
        </p>
      ) : (
        <ol className="grid gap-3">
          {summary.comments.map((comment) => (
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
              <form
                method="post"
                action="/api/engagement/comments"
                className="grid gap-2"
              >
                <EngagementTargetFields target={target} returnTo={returnTo} />
                <input
                  type="hidden"
                  name="parentCommentId"
                  value={comment.replyToken}
                />
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  {copy.engagement.reply}
                  <textarea
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
            </li>
          ))}
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
}: {
  action: string;
  target: EngagementTarget;
  returnTo: string;
  label: string;
  icon: ReactNode;
  variant?: "outline";
}) {
  return (
    <form method="post" action={action}>
      <EngagementTargetFields target={target} returnTo={returnTo} />
      <button
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
