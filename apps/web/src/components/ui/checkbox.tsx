import { CheckIcon as Check } from "@/components/icons/Check";

import { cn } from "@/lib/utils";

/**
 * A native `<input type="checkbox">`, drawn with CSS. No JavaScript, no roving
 * state to re-implement, and the browser's own keyboard behaviour: Space
 * toggles, the label is clickable, and a form submits it as `formData`.
 *
 * The box is 20 px; the `::before` on the wrapping label extends the pointer
 * target to 44 × 44 on touch without moving the visual (DESIGN.md §4.3).
 */
function Checkbox({
  className,
  label,
  description,
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "size"> & {
  /** The visible label. A checkbox is never labelled by position alone. */
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <label
      data-slot="checkbox"
      className={cn(
        "relative flex items-start gap-3 text-body-sm",
        "before:absolute before:top-1/2 before:left-0 before:size-11 before:-translate-x-1.5 before:-translate-y-1/2",
        disabled ? "text-text-disabled" : "cursor-pointer text-text",
        className,
      )}
    >
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          disabled={disabled}
          className={cn(
            "peer size-5 appearance-none rounded-sm border border-border-control bg-surface",
            "transition-colors duration-instant ease-out outline-none",
            "checked:border-action checked:bg-action",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            "disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken",
          )}
          {...props}
        />
        <Check
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 m-auto size-4 text-text-on-fill opacity-0 peer-checked:opacity-100"
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

export { Checkbox };
