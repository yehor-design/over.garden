import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * A small, static label on an object: a status, a kind, a count.
 *
 * Colour is never the only signal (DESIGN.md §8), so a badge always carries a
 * word; an icon may join it, never replace it. A badge is not a control — a
 * removable one is a `Chip`.
 */
const badgeVariants = cva(
  "inline-flex max-w-full shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium break-words whitespace-normal [&_svg]:size-4",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-text-secondary",
        success: "bg-success-surface text-success-text",
        danger: "bg-danger-surface text-danger-text",
        warning: "bg-warning-surface text-warning-text",
        info: "bg-info-surface text-info-text",
        action: "bg-action-subtle text-action-subtle-text",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Badge({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
