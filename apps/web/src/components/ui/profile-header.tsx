import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Who a gardener is, at the top of their profile (`OVE-494`).
 *
 * Threads' compact identity: the name and the handle, the picture beside them,
 * the bio in the gardener's own line breaks, the facts that are not counts,
 * the counts in words, and **one** action — the rest belong in a menu. Nothing
 * above the name: the page's title is the gardener, not the word "Profile".
 *
 * **A count is a sentence fragment, not a dashboard tile.** "12 підписників"
 * reads as what it is; a grid of labelled numbers made a profile with three
 * followers look like an analytics panel. The caller omits a count of zero
 * and a count the gardener keeps hidden — a row of zeros tells a visitor only
 * that nothing is happening, and the empty state below already says it.
 *
 * **No picture is not a placeholder of one.** The avatar falls back to the
 * gardener's initials, decorative and hidden from assistive technology: the
 * name beside it carries the meaning.
 */

export interface ProfileHeaderProps extends Omit<
  React.ComponentProps<"header">,
  "title"
> {
  avatarUrl?: string | null;
  displayName: string;
  /** With the `@`. It is an address, not a decoration. */
  handle: string;
  /**
   * The gardener's own words, whole, in their own line breaks. A profile is
   * content, not a dashboard (ADR-0031 D4).
   */
  bio?: string | null;
  /** The region, the languages — facts that are not counts. */
  meta?: React.ReactNode;
  /** Counts in words — "12 підписників" — already without the zeros. */
  counts?: readonly string[];
  /** Follow, or edit. One control; the rest belong in a menu. */
  action?: React.ReactNode;
  /**
   * `h1` on the profile's own page, and a lower level where it is embedded —
   * the owner's editor preview nests a whole profile under its own `h2`, and a
   * heading that outranked the page it sits in would skip a level backwards.
   */
  headingLevel?: "h1" | "h2" | "h3";
  headingId?: string;
}

function ProfileHeader({
  className,
  avatarUrl,
  displayName,
  handle,
  bio,
  meta,
  counts = [],
  action,
  headingLevel = "h1",
  headingId,
  ...props
}: ProfileHeaderProps) {
  const Heading = headingLevel;

  return (
    <header
      data-slot="profile-header"
      className={cn("grid gap-4 pb-2", className)}
      {...props}
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1">
          {/* `wrap-anywhere`, not `break-words`: a gardener with no display
              name is shown as their handle — one long word — and only
              `anywhere` lets the word's own width shrink, so the name wraps at
              320 px instead of widening the page. */}
          <Heading
            id={headingId}
            className="text-h1 wrap-anywhere text-text-heading"
          >
            {displayName}
          </Heading>
          <p className="text-body-sm wrap-anywhere text-text-muted">{handle}</p>
        </div>
        <Avatar src={avatarUrl} name={displayName} size="xl" />
      </div>
      {bio ? (
        <p
          data-profile-bio="true"
          className="max-w-prose text-body break-words whitespace-pre-line text-text"
        >
          {bio}
        </p>
      ) : null}
      {meta ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-text-muted">
          {meta}
        </div>
      ) : null}
      {counts.length > 0 ? (
        <ul
          data-profile-counts="true"
          className="flex list-none flex-wrap gap-x-3 gap-y-1 text-body-sm text-text-secondary"
        >
          {counts.map((count, index) => (
            <li key={count} className="flex items-center gap-3 tabular-nums">
              {index > 0 ? (
                <span aria-hidden="true" className="text-text-disabled">
                  ·
                </span>
              ) : null}
              {count}
            </li>
          ))}
        </ul>
      ) : null}
      {action ? (
        <div className="flex flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </header>
  );
}

export { ProfileHeader };
