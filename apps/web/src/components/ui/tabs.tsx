"use client";

import { useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A tab list with roving tabindex.
 *
 * One tab is in the tab order at a time and the arrow keys move between them —
 * which is the whole point of the pattern: Tab leaves the tab list rather than
 * walking through every tab. `Home` and `End` jump to the ends, and moving
 * focus selects, because these tabs show panels that are already rendered.
 *
 * A tab list is navigation *within* one screen. Navigation *between* screens is
 * the rail or a link, never this.
 */
export interface TabModel {
  id: string;
  label: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}

function Tabs({
  className,
  label,
  tabs,
  defaultTabId,
  selectedId: controlledId,
  onSelect,
  ...props
}: Omit<React.ComponentProps<"div">, "children" | "onSelect"> & {
  /** Names the tab list. A `tablist` with no name says only "tab list". */
  label: string;
  tabs: readonly TabModel[];
  defaultTabId?: string;
  /**
   * Controlled selection. A screen whose selected tab belongs in the URL
   * passes this and `onSelect` — because a tab that a reader cannot share or
   * reload back into is a tab that forgot what it was for.
   */
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const scope = useId();
  const enabled = tabs.filter((tab) => !tab.disabled);
  const [uncontrolledId, setUncontrolledId] = useState(
    defaultTabId ?? enabled[0]?.id ?? tabs[0]?.id ?? "",
  );
  const selectedId = controlledId ?? uncontrolledId;
  const setSelectedId = (id: string) => {
    if (controlledId === undefined) setUncontrolledId(id);
    onSelect?.(id);
  };
  const refs = useRef(new Map<string, HTMLButtonElement | null>());

  const move = (delta: number) => {
    const index = enabled.findIndex((tab) => tab.id === selectedId);
    if (index < 0 || enabled.length === 0) return;
    const next =
      enabled[(index + delta + enabled.length) % enabled.length]?.id ?? "";
    setSelectedId(next);
    refs.current.get(next)?.focus();
  };

  const jump = (to: "first" | "last") => {
    const target = to === "first" ? enabled[0]?.id : enabled.at(-1)?.id;
    if (!target) return;
    setSelectedId(target);
    refs.current.get(target)?.focus();
  };

  return (
    <div data-slot="tabs" className={cn("grid gap-4", className)} {...props}>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 border-b border-border"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          } else if (event.key === "Home") {
            event.preventDefault();
            jump("first");
          } else if (event.key === "End") {
            event.preventDefault();
            jump("last");
          }
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.id === selectedId;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current.set(tab.id, node);
              }}
              type="button"
              role="tab"
              id={`${scope}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${scope}-panel-${tab.id}`}
              // Roving tabindex: exactly one tab is reachable with Tab.
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => setSelectedId(tab.id)}
              className={cn(
                "-mb-px min-h-10 rounded-t-md border-b-2 px-3 text-body-sm font-medium",
                "transition-colors duration-instant ease-out outline-none",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
                "disabled:cursor-not-allowed disabled:text-text-disabled",
                selected
                  ? "border-action text-text"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${scope}-panel-${tab.id}`}
          aria-labelledby={`${scope}-tab-${tab.id}`}
          hidden={tab.id !== selectedId}
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}

export { Tabs };
