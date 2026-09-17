import { cn } from "@/lib/utils";

/**
 * A row of related actions. It is a `group` landmark with a required label, so
 * a screen reader announces what the row is for before reading five verbs.
 *
 * It carries no `primary` rule of its own — DESIGN.md §4.4 keeps that a review
 * rule, because "one primary per screen region" is about the region, not the
 * group.
 */
function ButtonGroup({
  className,
  label,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"div"> & {
  label: string;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      data-slot="button-group"
      role="group"
      aria-label={label}
      data-orientation={orientation}
      className={cn(
        "flex flex-wrap gap-2",
        orientation === "vertical" && "flex-col items-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { ButtonGroup };
