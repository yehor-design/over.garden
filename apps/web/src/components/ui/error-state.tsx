import { WarningIcon as TriangleAlert } from "@/components/icons/Warning";

import { cn } from "@/lib/utils";
import type { WorkspaceFailureClass } from "@/server/workspace-failure";

/**
 * A failure the server rendered on purpose.
 *
 * ADR-0023: under Cache Components a Server Component that throws while a
 * postponed response is resumed leaves its Suspense boundary pending forever on
 * a hard load — no `$RX` instruction is written, `error.tsx` never renders, and
 * the reader keeps the skeleton. So a failure is a **value**, and this is what
 * that value looks like.
 *
 * Three things it is careful about:
 *
 * - **The class never becomes copy.** `permission_denied` travels as
 *   `data-section-failure`, so a proof and an operator can read it and no
 *   locale gains a machine code. The sentences are the caller's, in the
 *   reader's language.
 * - **The digest is printed.** It is the one string that lets the person on the
 *   screen and the person reading `workspace_section_degraded` in the log talk
 *   about the same event. It is a hash of the class and the driver code only.
 * - **`technicalHint` is for the owner alone.** Naming the missing relation is
 *   help for the person who can apply the migration and noise on a gardener's
 *   screen.
 *
 * The retry is a real link first: it works before the bundle does. A caller may
 * pass its own control instead when the page has one.
 */
function ErrorState({
  className,
  id,
  failureClass,
  digest,
  title,
  description,
  technicalHint,
  reference,
  retryHref,
  retryLabel,
  retry,
  as: Component = "section",
  headingLevel = 2,
  ...props
}: Omit<React.HTMLAttributes<HTMLElement>, "title"> & {
  failureClass: WorkspaceFailureClass;
  digest: string;
  title: React.ReactNode;
  /** One sentence: what to do next, never what went wrong internally. */
  description?: React.ReactNode;
  technicalHint?: string | null;
  /** The digest line, already localised — e.g. "Reference: 1A2B3C4". */
  reference?: React.ReactNode;
  retryHref?: string;
  retryLabel?: string;
  /** A control that replaces the plain link once the page has one. */
  retry?: React.ReactNode;
  as?: "section" | "div";
  /**
   * `1` when this state *is* the page — an `error.tsx` boundary replaces the
   * whole document, and a page whose only heading is an `h2` skips a level
   * (DESIGN.md §8). `2` for one failed section inside a working page.
   */
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <Component
      data-slot="error-state"
      data-screen-state="error"
      data-section-failure={failureClass}
      id={id}
      className={cn("scroll-mt-20 border-y border-border py-6", className)}
      {...props}
    >
      <TriangleAlert aria-hidden="true" className="size-5 text-danger-text" />
      <Heading
        className={cn(
          "mt-2 text-text-heading",
          headingLevel === 1 ? "text-h1" : "text-h3",
        )}
      >
        {title}
      </Heading>
      {description ? (
        <p className="mt-1 max-w-prose text-body-sm text-text-muted">
          {description}
        </p>
      ) : null}
      {technicalHint ? (
        <p className="mt-2 max-w-prose text-body-sm text-text-muted">
          {technicalHint}
        </p>
      ) : null}
      <p
        className="mt-2 font-mono text-mono text-text-muted"
        data-error-digest={digest}
      >
        {reference ?? digest}
      </p>
      {retry ??
        (retryHref ? (
          <a
            href={retryHref}
            className="text-link hover:text-link-hover mt-4 inline-flex min-h-10 items-center rounded-md text-body-sm font-medium underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {retryLabel}
          </a>
        ) : null)}
    </Component>
  );
}

export { ErrorState };
