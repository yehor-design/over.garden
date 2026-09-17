import { cn } from "@/lib/utils";

/**
 * A two-state control that takes effect on change rather than on submit.
 *
 * It is a native checkbox with `role="switch"`: the platform gives Space, the
 * label, and the form value, and ARIA gives the announcement ("on"/"off"
 * instead of "checked"). A switch that only works after hydration is a defect
 * on a public page (ADR-0024 D3), so there is no JavaScript here either.
 */
function Switch({
  className,
  label,
  description,
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "size" | "role"> & {
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <label
      data-slot="switch"
      className={cn(
        "relative flex items-start justify-between gap-4 text-body-sm",
        "before:absolute before:top-1/2 before:right-0 before:size-11 before:translate-x-1.5 before:-translate-y-1/2",
        disabled ? "text-text-disabled" : "cursor-pointer text-text",
        className,
      )}
    >
      <span className="grid gap-1">
        <span>{label}</span>
        {description ? (
          <span className="text-caption text-text-muted">{description}</span>
        ) : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          disabled={disabled}
          className={cn(
            "peer h-6 w-11 appearance-none rounded-full border border-border-control bg-surface-hover",
            "transition-colors duration-instant ease-out outline-none",
            "checked:border-action checked:bg-action",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            "disabled:cursor-not-allowed disabled:bg-surface-sunken",
          )}
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 left-0.5 size-5 -translate-y-1/2 rounded-full bg-border-control",
            "transition-transform duration-fast ease-out",
            "peer-checked:translate-x-5 peer-checked:bg-text-on-fill",
          )}
        />
      </span>
    </label>
  );
}

export { Switch };
