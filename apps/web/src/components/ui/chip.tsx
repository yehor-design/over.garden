import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A filter, shown as a removable pill.
 *
 * DESIGN.md §5.1: active filters appear as removable chips above the results.
 * The remove control is a real `<button>` with its own accessible name, because
 * "remove" alone tells a reader nothing about what is being removed.
 */
function Chip({
  className,
  label,
  onRemove,
  removeLabel,
  ...props
}: Omit<React.ComponentProps<"span">, "onRemove"> & {
  label: React.ReactNode;
  onRemove?: React.MouseEventHandler<HTMLButtonElement>;
  /** The whole sentence, e.g. "Remove filter: tomatoes". */
  removeLabel?: string;
}) {
  return (
    <span
      data-slot="chip"
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border border-border-control bg-surface py-1 pr-1 pl-3 text-body-sm text-text",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{label}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className={cn(
            "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-text-muted",
            "before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2",
            "hover:bg-surface-hover hover:text-text",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          )}
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
    </span>
  );
}

/**
 * A filter the reader toggles. It is a real checkbox: the state is announced as
 * checked or unchecked, the keyboard works, and a filter bar submits without
 * JavaScript when it sits in a form.
 */
function FilterChip({
  className,
  label,
  count,
  countLabel,
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "size"> & {
  label: React.ReactNode;
  count?: number;
  /** The number in the reader's language; the chip formats nothing. */
  countLabel?: string;
}) {
  return (
    <label
      data-slot="filter-chip"
      className={cn(
        "relative inline-flex min-h-8 items-center gap-2 rounded-full border border-border-control px-3 text-body-sm",
        "transition-colors duration-instant ease-out",
        "before:absolute before:top-1/2 before:left-0 before:h-11 before:w-full before:-translate-y-1/2",
        "has-[:checked]:border-action has-[:checked]:bg-action-subtle has-[:checked]:text-action-subtle-text",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
        disabled
          ? "cursor-not-allowed text-text-disabled"
          : "cursor-pointer text-text hover:bg-surface-hover",
        className,
      )}
    >
      <input
        type="checkbox"
        disabled={disabled}
        className="sr-only"
        {...props}
      />
      <span>{label}</span>
      {countLabel ?? typeof count === "number" ? (
        <span className="text-caption text-text-muted tabular-nums">
          {countLabel ?? count}
        </span>
      ) : null}
    </label>
  );
}

/**
 * A chip the reader presses to change what a list shows, when the change is a
 * navigation rather than a field in a larger form.
 *
 * It is a real `<button type="submit">` inside a `<form method="get">`, which
 * is what makes three things true at once: `aria-pressed` states whether the
 * filter is on (valid only on a button — a link with `aria-pressed` is an ARIA
 * error, and that is why the feed's filters stopped being links), the press
 * works with the bundle absent because a GET form is the browser's own
 * mechanism, and the resulting filter lands in the URL so the view is linkable
 * (DESIGN.md §5.1, ADR-0031 D6).
 *
 * Pressing the chip that is already on turns it **off**: the caller omits
 * `name`, the button submits the form without contributing a value, and the
 * parameter simply is not in the next URL.
 */
function ToggleChip({
  className,
  label,
  count,
  pressed,
  icon,
  ...props
}: Omit<React.ComponentProps<"button">, "type" | "children"> & {
  label: React.ReactNode;
  count?: number;
  pressed: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      data-slot="toggle-chip"
      aria-pressed={pressed}
      className={cn(
        "relative inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-body-sm",
        "transition-colors duration-instant ease-out",
        // WCAG 2.2 2.5.8: the visual chip is 32 px and the target is 44.
        "before:absolute before:top-1/2 before:left-0 before:h-11 before:w-full before:-translate-y-1/2",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        pressed
          ? "border-action bg-action-subtle text-action-subtle-text"
          : "border-border-control text-text hover:bg-surface-hover",
        className,
      )}
      {...props}
    >
      {icon}
      <span>{label}</span>
      {typeof count === "number" ? (
        <span className="text-caption text-text-muted tabular-nums">
          {count}
        </span>
      ) : null}
    </button>
  );
}

export { Chip, FilterChip, ToggleChip };
