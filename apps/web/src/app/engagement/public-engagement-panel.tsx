import { Bookmark, Heart, MessageCircle, Reply } from "lucide-react";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import type {
  EngagementTarget,
  PublicEngagementSummary,
} from "@/server/engagement-repository";

interface PublicEngagementPanelProps {
  target: EngagementTarget;
  summary: PublicEngagementSummary;
  returnTo: string;
  status?: string | null;
}

export function PublicEngagementPanel({
  target,
  summary,
  returnTo,
  status,
}: PublicEngagementPanelProps) {
  return (
    <section className="grid gap-4 border-y border-border py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <EngagementButtonForm
            action="/api/engagement/likes"
            target={target}
            returnTo={returnTo}
            label="Like"
            icon={<Heart className="size-4" />}
          />
          <EngagementButtonForm
            action="/api/engagement/bookmarks"
            target={target}
            returnTo={returnTo}
            label="Bookmark"
            icon={<Bookmark className="size-4" />}
            variant="outline"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {summary.activeLikeCount} like
          {summary.activeLikeCount === 1 ? "" : "s"}
        </p>
      </div>

      {status ? (
        <p className="text-sm text-muted-foreground">
          {engagementStatusMessage(status)}
        </p>
      ) : null}

      <form
        method="post"
        action="/api/engagement/comments"
        className="grid gap-3"
      >
        <EngagementTargetFields target={target} returnTo={returnTo} />
        <label className="grid gap-2 text-sm font-medium text-foreground">
          Comment
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
          Comment
        </button>
      </form>

      {summary.comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
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
                  {formatDate(comment.createdAt)}
                </time>
              </div>
              {comment.parentReplyToken ? (
                <p className="text-xs text-muted-foreground">Reply</p>
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
                  Reply
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
                  Reply
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

function engagementStatusMessage(status: string) {
  switch (status) {
    case "liked":
      return "Liked.";
    case "unliked":
      return "Like removed.";
    case "like-rate-limited":
      return "Too many like toggles. Try again later.";
    case "bookmarked":
      return "Saved to bookmarks.";
    case "bookmark-removed":
      return "Removed from bookmarks.";
    case "commented":
      return "Comment posted.";
    default:
      return "";
  }
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
