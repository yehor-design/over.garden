import { cn } from "@/lib/utils";

const sizes = {
  sm: "size-4 border-2",
  md: "size-5 border-2",
  lg: "size-6 border-[3px]",
} as const;

/**
 * A busy indicator. It carries no accessible name of its own: whatever is busy
 * owns the announcement (`aria-busy`, or a live region), so a spinner inside a
 * button must not also speak. DESIGN.md §5.4 forbids a spinner as a page's
 * loading state — a page uses a skeleton shaped like its real layout.
 */
function Spinner({
  className,
  size = "md",
  ...props
}: React.ComponentProps<"span"> & { size?: keyof typeof sizes }) {
  return (
    <span
      data-slot="spinner"
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent",
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export { Spinner };
