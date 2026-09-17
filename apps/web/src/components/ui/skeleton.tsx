import { cn } from "@/lib/utils";

/**
 * A box the size of the thing that has not arrived yet.
 *
 * DESIGN.md §5.4: a loading state is a skeleton shaped like the real layout,
 * never a spinner on a page — and it must not outlive its data by design. A
 * section that can fail settles into a failure class instead of waiting
 * forever, because the framework defect in ADR-0023 is still unfixed upstream.
 */

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-surface-hover", className)}
      {...props}
    />
  );
}

export { Skeleton };
