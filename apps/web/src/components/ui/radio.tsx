import { cn } from "@/lib/utils";

/**
 * A native radio group. The browser already implements the pattern the WAI-ARIA
 * guide describes for a radio group — arrow keys move and select within the
 * group, Tab leaves it — so re-implementing it can only lose.
 *
 * `RadioGroup` is a `<fieldset>` with a `<legend>`: the group's question is
 * announced before its options, which a `div role="radiogroup"` plus a floating
 * heading does not do reliably.
 */
function RadioGroup({
  className,
  legend,
  description,
  orientation = "vertical",
  children,
  ...props
}: React.ComponentProps<"fieldset"> & {
  legend: React.ReactNode;
  description?: React.ReactNode;
  orientation?: "vertical" | "horizontal";
}) {
  return (
    <fieldset
      data-slot="radio-group"
      data-orientation={orientation}
      className={cn("grid gap-2", className)}
      {...props}
    >
      <legend className="text-h4 text-text-heading">{legend}</legend>
      {description ? (
        <p className="text-body-sm text-text-muted">{description}</p>
      ) : null}
      <div
        className={cn(
          "grid gap-2",
          orientation === "horizontal" && "flex flex-wrap gap-4",
        )}
      >
        {children}
      </div>
    </fieldset>
  );
}

/**
 * `presentation="custom"` is for a choice whose visual is a thumbnail, a tile or
 * a segment rather than a dot — an avatar picker, a segmented control. The input
 * stays a real radio, visually hidden but focusable and keyboard-operable, and
 * `label` becomes its accessible name so the name never depends on whatever the
 * visual happens to contain.
 */
function Radio({
  className,
  label,
  description,
  disabled,
  presentation = "control",
  children,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "size"> & {
  label: string;
  description?: React.ReactNode;
  presentation?: "control" | "custom";
  children?: React.ReactNode;
}) {
  if (presentation === "custom") {
    return (
      <label
        data-slot="radio"
        data-presentation="custom"
        className={cn(
          "relative has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          className,
        )}
      >
        <input
          type="radio"
          aria-label={label}
          disabled={disabled}
          className="sr-only"
          {...props}
        />
        {children}
      </label>
    );
  }

  return (
    <label
      data-slot="radio"
      className={cn(
        "relative flex items-start gap-3 text-body-sm",
        "before:absolute before:top-1/2 before:left-0 before:size-11 before:-translate-x-1.5 before:-translate-y-1/2",
        disabled ? "text-text-disabled" : "cursor-pointer text-text",
        className,
      )}
    >
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="radio"
          disabled={disabled}
          className={cn(
            "peer size-5 appearance-none rounded-full border border-border-control bg-surface",
            "transition-colors duration-instant ease-out outline-none",
            "checked:border-action",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            "disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken",
          )}
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 m-auto size-2.5 rounded-full bg-action opacity-0 peer-checked:opacity-100"
        />
      </span>
      <span className="grid gap-1">
        <span>{label}</span>
        {description ? (
          <span className="text-caption text-text-muted">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

export { Radio, RadioGroup };
