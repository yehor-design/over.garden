import { cn } from "@/lib/utils";

/**
 * Where like, bookmark, follow and comment sit, and where their counts are
 * announced.
 *
 * It is a **container**, not a reimplementation of the controls, and that is
 * deliberate. Each control is a `<form action={serverAction}>` over a real
 * endpoint (ADR-0024 D3, DESIGN.md §5.6) and lives in
 * `app/engagement/engagement-controls.tsx`, where one standing test reads the
 * source to prove the action is a Server Action reference and not a client
 * closure. Moving them into `ui/` would put a Server Action import inside the
 * design system and give that guard a second place to look. So the bar owns
 * the arrangement and the live region; the controls own the endpoints.
 *
 * The live region is the part worth being careful about, and the rule is
 * **one of them**. `§5.6` asks for the count in an `aria-live="polite"`
 * region; a bar that always drew its own *and* held a control that draws one
 * gives a reader two, and prints the number twice on screen — which is what
 * the first version of this did. So:
 *
 * - A surface whose controls carry their own live count (the entry page,
 *   where the like control's number is the optimistic one `useFormStatus`
 *   updates on the press) passes **no** `status`, and the bar draws no region.
 * - A surface with no interactive count (a card, a listing row) passes
 *   `status`, and the bar draws the region for it.
 *
 * Either way a control carries the count in its own accessible name —
 * "Подобається, 12 вподобань" becoming "Уже подобається, 13 вподобань" —
 * because that is what a screen-reader user hears *before* pressing.
 */

export interface EngagementBarProps extends React.ComponentProps<"div"> {
  /** Names the group: "Дії із записом", not "engagement". */
  label: string;
  /**
   * The settled counts, as one short sentence — "12 вподобань · 3 коментарі".
   * Given only by a surface whose controls carry no live count of their own;
   * see the note above about there being exactly one region.
   */
  status?: React.ReactNode;
  /** Secondary actions that are not counts: report, manage, open elsewhere. */
  secondary?: React.ReactNode;
}

function EngagementBar({
  className,
  label,
  status,
  secondary,
  children,
  ...props
}: EngagementBarProps) {
  return (
    <div
      data-slot="engagement-bar"
      role="group"
      aria-label={label}
      className={cn(
        "flex flex-wrap items-center gap-2 border-y border-border py-3",
        className,
      )}
      {...props}
    >
      {children}
      {secondary ? (
        <div className="flex flex-wrap items-center gap-2">{secondary}</div>
      ) : null}
      {status ? (
        <p
          data-engagement-status="true"
          aria-live="polite"
          className="ml-auto text-caption text-text-muted tabular-nums"
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}

export { EngagementBar };
