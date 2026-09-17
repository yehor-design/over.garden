import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const TONES = {
  info: {
    icon: Info,
    surface: "border-info-border bg-info-surface",
    mark: "text-info-text",
  },
  success: {
    icon: CircleCheck,
    surface: "border-success-border bg-success-surface",
    mark: "text-success-text",
  },
  warning: {
    icon: TriangleAlert,
    // A warning is a surface with ink text and an amber edge, never white text
    // on an amber fill: `white on amber-600` measures 3.24 (DESIGN.md §2.1).
    surface: "border-warning-border bg-warning-surface",
    mark: "text-warning-fill",
  },
  danger: {
    icon: CircleAlert,
    surface: "border-danger-border bg-danger-surface",
    mark: "text-danger-text",
  },
} satisfies Record<string, { icon: LucideIcon; surface: string; mark: string }>;

export type CalloutTone = keyof typeof TONES;

/**
 * A short, in-page message about the screen or the form it sits in.
 *
 * `role="alert"` is not decoration and not a default: it interrupts whatever a
 * screen reader is saying. A **form-level error** earns it (DESIGN.md §5.3); a
 * routine success does not, and gets `role="status"` or nothing at all.
 *
 * The icon is `aria-hidden` and the tone is carried by the words as well as the
 * colour, so the message survives a reader who cannot see the colour.
 */
function Callout({
  className,
  tone = "info",
  title,
  live = "off",
  children,
  actions,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  tone?: CalloutTone;
  title?: React.ReactNode;
  /**
   * `assertive` renders `role="alert"` — reserve it for a form-level error.
   * `polite` renders `role="status"` for an asynchronous outcome.
   */
  live?: "off" | "polite" | "assertive";
  actions?: React.ReactNode;
}) {
  const { icon: Icon, surface, mark } = TONES[tone];
  return (
    <div
      data-slot="callout"
      data-tone={tone}
      role={
        live === "assertive"
          ? "alert"
          : live === "polite"
            ? "status"
            : undefined
      }
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 text-body-sm text-text",
        surface,
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", mark)} />
      <div className="grid min-w-0 flex-1 gap-2">
        {title ? (
          <p className="font-medium text-text-heading">{title}</p>
        ) : null}
        {children ? <div className="min-w-0">{children}</div> : null}
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

export { Callout };
