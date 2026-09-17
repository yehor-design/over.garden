import { cn } from "@/lib/utils";

/**
 * Determinate progress: an upload, an import, a step through a sequence.
 *
 * It is a real `progressbar` with its bounds and its value, so a reader hears
 * "40 per cent" rather than a coloured rectangle. The label is required,
 * because "progress" alone says nothing about what is progressing. For work
 * with no known end, use `Spinner`.
 */
function ProgressBar({
  className,
  label,
  value,
  max = 100,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: string;
  value: number;
  max?: number;
}) {
  const clamped = Math.min(Math.max(value, 0), max);
  return (
    <div
      data-slot="progress-bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamped}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-surface-hover",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className="h-full rounded-full bg-action transition-[width] duration-base ease-out"
        // The width is the value; it cannot be a token, and a `style` prop is
        // the only way to express a computed geometry (the ESLint rule exempts
        // `ui/` for exactly this).
        style={{ width: `${(clamped / max) * 100}%` }}
      />
    </div>
  );
}

export { ProgressBar };
