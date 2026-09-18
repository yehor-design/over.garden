import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Who a gardener is, at the top of their profile.
 *
 * The shape Substack, Telescope and Skillshare all landed on: picture, name,
 * handle, one line about them, the counts, and the one action. `OVE-457`
 * reuses it for the workspace's own profile page, which is why the counts and
 * the action are props rather than decisions made here.
 *
 * **A count of zero is omitted rather than printed.** It is the same rule the
 * feed's topic row and a community card follow, and the reason is the same: a
 * row of zeros tells a visitor only that nothing is happening, while the empty
 * state below already says it in words. A count that is *hidden* rather than
 * absent — a gardener who does not publish their relationships — is omitted
 * too, and the page says so in a sentence instead of printing a blank.
 *
 * Skillshare's "these stats are only visible to you" is the model for
 * `privateNote`: a count that is real, shown to its owner, and marked as not
 * being what a visitor sees.
 */

export interface ProfileHeaderCount {
  label: string;
  /** `null` means hidden; `0` means nothing yet. Neither is rendered. */
  value: number | null;
  /** "only you can see this" — shown beside the number, for its owner. */
  privateNote?: string;
}

export interface ProfileHeaderProps
  extends Omit<React.ComponentProps<"header">, "title"> {
  avatarUrl?: string | null;
  displayName: string;
  /** With the `@`. It is an address, not a decoration. */
  handle: string;
  /** One line. A profile is content, not a dashboard (ADR-0031 D4). */
  bio?: string | null;
  /** The region, the languages — facts that are not counts. */
  meta?: React.ReactNode;
  counts?: readonly ProfileHeaderCount[];
  /** Follow, or edit. One control; the rest belong in a menu. */
  action?: React.ReactNode;
  /** An eyebrow above the name: "Профіль". */
  eyebrow?: React.ReactNode;
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
  eyebrow,
  headingLevel = "h1",
  headingId,
  ...props
}: ProfileHeaderProps) {
  const Heading = headingLevel;
  const shown = counts.filter(
    (count) => typeof count.value === "number" && count.value > 0,
  );

  return (
    <header
      data-slot="profile-header"
      className={cn("grid gap-5 border-b border-border pb-6", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar src={avatarUrl} name={displayName} size="xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-overline text-text-muted uppercase">
                {eyebrow}
              </p>
            ) : null}
            <Heading
              id={headingId}
              className="mt-1 text-h1 break-words text-text-heading"
            >
              {displayName}
            </Heading>
            <p className="mt-1 text-body-sm break-words text-text-muted">
              {handle}
            </p>
          </div>
          {bio ? (
            <p className="max-w-prose text-body-sm break-words text-text-secondary">
              {bio}
            </p>
          ) : null}
          {meta ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-sm text-text-muted">
              {meta}
            </div>
          ) : null}
          {action ? (
            <div className="flex flex-wrap items-center gap-2">{action}</div>
          ) : null}
        </div>
      </div>

      {shown.length > 0 ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {shown.map((count) => (
            <div key={count.label} className="min-w-0">
              <dt className="text-caption text-text-muted">
                {count.label}
                {count.privateNote ? (
                  <span className="ml-1 text-text-disabled">
                    ({count.privateNote})
                  </span>
                ) : null}
              </dt>
              <dd className="text-h3 text-text-heading tabular-nums">
                {count.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}

export { ProfileHeader };
