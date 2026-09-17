"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

/** DESIGN.md §5.5: five seconds, and the same five for every toast. */
export const TOAST_DURATION_MS = 5_000;

/**
 * The outcome of a completed action.
 *
 * Three rules it enforces rather than documents:
 *
 * - **`role="status"`**, never `role="alert"`. A routine success does not
 *   interrupt what a screen reader is saying (DESIGN.md §8).
 * - **It is never the only copy of anything.** A toast disappears; anything a
 *   reader might need again belongs on the page. This component cannot check
 *   that, so it says so here and the review does.
 * - **A destructive outcome offers Undo**, which is why `undo` is a separate
 *   prop rather than one of `actions`: it is the difference between a deletion
 *   a reader can take back and one they cannot.
 *
 * The timer pauses while the toast has focus inside it, so a reader reaching
 * Undo with the keyboard does not lose it mid-Tab.
 */
function Toast({
  className,
  title,
  description,
  undo,
  onDismiss,
  dismissLabel,
  duration = TOAST_DURATION_MS,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A control, for a destructive outcome. */
  undo?: React.ReactNode;
  onDismiss?: () => void;
  dismissLabel: string;
  duration?: number;
}) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!onDismiss || paused) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss, paused]);

  return (
    <div
      data-slot="toast"
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-popover",
        className,
      )}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      {...props}
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="text-body-sm font-medium text-text-heading">{title}</p>
        {description ? (
          <p className="text-body-sm text-text-muted">{description}</p>
        ) : null}
        {undo ? <div className="mt-1">{undo}</div> : null}
      </div>
      {onDismiss ? (
        <IconButton
          size="sm"
          variant="ghost"
          label={dismissLabel}
          onClick={onDismiss}
        >
          <X />
        </IconButton>
      ) : null}
    </div>
  );
}

/**
 * Where toasts sit. One region per document, above everything, and it never
 * captures a pointer between toasts.
 */
function ToastRegion({
  className,
  label,
  ...props
}: React.ComponentProps<"div"> & { label: string }) {
  return (
    <div
      data-slot="toast-region"
      aria-label={label}
      className={cn(
        "pointer-events-none fixed inset-x-4 bottom-4 z-toast flex flex-col items-center gap-2 sm:right-4 sm:left-auto sm:items-end",
        className,
      )}
      {...props}
    />
  );
}

export { Toast, ToastRegion };
