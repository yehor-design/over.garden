import { cn } from "@/lib/utils";

/**
 * A bordered block. DESIGN.md §2.5: this is a bordered system, not a shadowed
 * one — a card has no shadow at rest and **gains none on hover**. Hover changes
 * `--color-surface-hover` and nothing else, so nothing appears to lift off the
 * page that is not actually floating above it.
 *
 * `as="article"` is the shape a feed card takes, so a reader's screen reader
 * announces an article rather than an unnamed group.
 */
function Card({
  className,
  as: Component = "div",
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "article" | "section" | "li";
  /** A card the whole of which is a target. It still contains a real link. */
  interactive?: boolean;
}) {
  return (
    <Component
      data-slot="card"
      className={cn(
        "rounded-lg border border-border bg-surface",
        interactive &&
          "transition-colors duration-instant ease-out hover:bg-surface-hover",
        className,
      )}
      {...props}
    />
  );
}

/** A plain panel: the same surface language without the card's own border. */
function Surface({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<"div"> & {
  tone?: "default" | "sunken" | "raised";
}) {
  return (
    <div
      data-slot="surface"
      className={cn(
        "rounded-lg",
        tone === "sunken" && "bg-surface-sunken",
        tone === "raised" && "bg-surface-raised",
        tone === "default" && "bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export { Card, Surface };
