import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Previous and next, as real links.
 *
 * They are links rather than buttons because each page of a list has its own
 * address: a reader can open one in a new tab, a crawler can follow it, and it
 * survives a reload (DESIGN.md §5.1). A missing neighbour renders as disabled
 * text rather than a link to nowhere.
 *
 * **Below `sm` the reader's place takes a row of its own, above the two
 * edges.** Side by side the three need 330 px in Bulgarian ("Покажи още
 * дневници") and 341 px in Russian, and a row that cannot wrap made `/journals`
 * scroll sideways at 320 px in both — WCAG 1.4.10, measured on production on
 * 2026-09-20 and missed because the spec that measures it ran in no CI list.
 * The order in the document does not change: previous, place, next.
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
  // `min-w-0`: a grid item is as wide as its longest word unless told it may
  // be narrower, and a label that may not shrink is a label that overflows.
  const edge =
    "inline-flex min-h-10 min-w-0 items-center gap-1 rounded-md px-3 text-body-sm font-medium";
  return (
    <nav
      data-slot="pagination"
      aria-label={label}
      className={cn(
        "grid grid-cols-2 items-center gap-x-3 gap-y-1 sm:flex sm:justify-between",
        className,
      )}
      {...props}
    >
      {previousHref ? (
        <a
          href={previousHref}
          rel="prev"
          className={cn(
            edge,
            "justify-self-start text-text hover:bg-surface-hover",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          )}
        >
          <ChevronLeft aria-hidden="true" className="size-4 shrink-0" />
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
          className={cn(edge, "justify-self-start text-text-disabled")}
        >
          <ChevronLeft aria-hidden="true" className="size-4 shrink-0" />
          {previousLabel}
        </button>
      )}
      {status ? (
        <p className="order-first col-span-2 text-center text-caption text-text-muted tabular-nums sm:order-none">
          {status}
        </p>
      ) : null}
      {nextHref ? (
        <a
          href={nextHref}
          rel="next"
          className={cn(
            edge,
            "col-start-2 justify-self-end text-right text-text hover:bg-surface-hover",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          )}
        >
          {nextLabel}
          <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
        </a>
      ) : (
        <button
          type="button"
          disabled
          className={cn(
            edge,
            "col-start-2 justify-self-end text-right text-text-disabled",
          )}
        >
          {nextLabel}
          <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
        </button>
      )}
    </nav>
  );
}

export { Pagination };
