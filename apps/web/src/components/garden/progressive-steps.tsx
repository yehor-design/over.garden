import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One question of a progressive setup (Airbnb's Where / When / Who, DESIGN.md
 * §5.3): open while it is being answered, folded into one line that says what
 * was chosen once it is, with a named "Change" that reopens it. Space setup
 * (`OVE-484`) and object setup (`OVE-485`) share it, so the two read and work
 * the same way.
 *
 * `slot` names the flow in the data attributes the specs address
 * (`data-space-setup-section`, `data-object-setup-section`).
 */
export function ProgressiveStep({
  slot,
  step,
  position,
  active,
  reached,
  question,
  optional,
  summary,
  changeLabel,
  onChange,
  headingRef,
  children,
}: {
  slot: string;
  step: string;
  /** "Step 2 of 4", already in the reader's language. */
  position: string;
  active: boolean;
  reached: boolean;
  question: string;
  optional?: string;
  summary: string | null;
  changeLabel: string;
  onChange: () => void;
  headingRef: (node: HTMLHeadingElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <li
      {...{ [`data-${slot}-section`]: step }}
      data-state={active ? "active" : reached ? "done" : "upcoming"}
      className={cn(
        "grid gap-3 rounded-lg border p-4 sm:p-5",
        active ? "border-border-strong bg-surface" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <span className="text-caption text-text-muted">
            {position}
            {optional ? ` · ${optional}` : ""}
          </span>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className={cn(
              "outline-none",
              active
                ? "text-h3 text-text-heading"
                : "text-body font-medium text-text",
            )}
          >
            {question}
          </h2>
          {!active && summary ? (
            <p
              className="text-body-sm break-words text-text-muted"
              {...{ [`data-${slot}-summary`]: step }}
            >
              {summary}
            </p>
          ) : null}
        </div>
        {!active && reached && summary ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onChange}
            aria-label={`${changeLabel}: ${question}`}
          >
            {changeLabel}
          </Button>
        ) : null}
      </div>
      {active ? <div className="grid gap-3">{children}</div> : null}
    </li>
  );
}

/**
 * Opens a step the way a reader expects to meet it: its question (or its
 * first field) takes focus, and the step comes to the top of the screen,
 * just below the header (`scroll-padding-top`).
 *
 * Focus alone scrolled only as far as it had to, so a new question landed
 * wherever the last click had left the page — often low on a phone, its
 * fields under the tab bar and the consent notice, and the answered step
 * above it resting half under the sticky header, a "Change" too small to
 * press (`OVE-505`). At the top, the new question and its fields are in view
 * and the answered steps are either wholly above it or out of view.
 */
export function openStep(target: HTMLElement | null) {
  if (!target) return;
  target.focus({ preventScroll: true });
  const step = target.closest<HTMLElement>("li[data-state]");
  // A document without layout (a test's jsdom) has no `scrollIntoView`.
  if (typeof step?.scrollIntoView === "function") {
    step.scrollIntoView({ block: "start" });
  }
}

/**
 * Kept in view above a phone keyboard: the actions stick to the bottom — on
 * top of the tab bar and the consent notice, never underneath them (`OVE-505`;
 * `above-bottom-chrome` in `globals.css`).
 */
export function ProgressiveActions({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sticky above-bottom-chrome -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-4 pt-3 pb-3 sm:static sm:mx-0 sm:border-0 sm:px-0 sm:pb-0">
      {children}
    </div>
  );
}
