import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Previous and next, as real links.
 *
 * They are links rather than buttons because each page of a list has its own
 * address: a reader can open one in a new tab, a crawler can follow it, and it
 * survives a reload (DESIGN.md §5.1). A missing neighbour renders as disabled
 * text rather than a link to nowhere.
 */
function Pagination({
  className,
  label,
  previousHref,
  previousLabel,
  nextHref,
  nextLabel,
  status,
  ...props
}: React.ComponentProps<"nav"> & {
  /** Names the landmark: "Journal pages", not "pagination". */
  label: string;
  previousHref?: string | null;
  previousLabel: string;
  nextHref?: string | null;
  nextLabel: string;
  /** "Page 2 of 9" — the reader's place, in their own language. */
  status?: React.ReactNode;
}) {
  const edge =
    "inline-flex min-h-10 items-center gap-1 rounded-md px-3 text-body-sm font-medium";
  return (
    <nav
      data-slot="pagination"
      aria-label={label}
      className={cn("flex items-center justify-between gap-3", className)}
      {...props}
    >
      {previousHref ? (
        <a
          href={previousHref}
          rel="prev"
          className={cn(
            edge,
            "text-text hover:bg-surface-hover",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          )}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {previousLabel}
        </a>
      ) : (
        // An edge with nowhere to go is an inactive control, and rendering it
        // as one is what makes that true rather than implied: a disabled
        // `<button>` is announced as unavailable and is exempt from 1.4.3,
        // where a dimmed `<span>` is just low-contrast text.
        <button
          type="button"
          disabled
          className={cn(edge, "text-text-disabled")}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {previousLabel}
        </button>
      )}
      {status ? (
        <p className="text-caption text-text-muted tabular-nums">{status}</p>
      ) : null}
      {nextHref ? (
        <a
          href={nextHref}
          rel="next"
          className={cn(
            edge,
            "text-text hover:bg-surface-hover",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          )}
        >
          {nextLabel}
          <ChevronRight aria-hidden="true" className="size-4" />
        </a>
      ) : (
        <button
          type="button"
          disabled
          className={cn(edge, "text-text-disabled")}
        >
          {nextLabel}
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      )}
    </nav>
  );
}

export { Pagination };
