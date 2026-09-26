"use client";

import { useRef, type ReactNode } from "react";

import { CheckIcon } from "@/components/icons/Check";
import { Radio } from "@/components/ui/radio";
import { cn } from "@/lib/utils";

export interface ChoiceRadioOption {
  value: string;
  title: string;
  subtitle?: string | null;
  /** A round glyph, or a small photo, before the title. */
  media?: ReactNode;
  data?: Record<`data-${string}`, string>;
}

/**
 * One answer out of a few, as the object stepper asks it (DESIGN.md §5.24):
 * Threads' rows — one surface split by hairlines, a round glyph or a photo,
 * the name in weight — with the chosen row's check. They are native radios in
 * a fieldset (`Radio`, custom presentation), so the arrow keys, Space and a
 * screen reader's radio group all work without a line of script.
 *
 * `onPick` is the Typeform half: a row tapped or clicked answers the question
 * and moves on. The keyboard's arrows only change the choice — Enter, the
 * step's submit, moves on — so reading the rows never skips a step.
 */
export function ChoiceRadioList({
  name,
  legend,
  options,
  value,
  onChange,
  onPick,
  className,
}: {
  name: string;
  /** The group's name; the step's question is its visible heading. */
  legend: string;
  options: readonly ChoiceRadioOption[];
  value: string | null;
  onChange: (value: string) => void;
  onPick?: (value: string) => void;
  className?: string;
}) {
  // Set by a pointer press on a row and spent by the click that follows it;
  // a radio chosen with the arrow keys never had one.
  const pointer = useRef(false);
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{legend}</legend>
      <div className="grid overflow-hidden rounded-lg border border-border bg-surface">
        {options.map((option, index) => {
          const chosen = option.value === value;
          return (
            <Radio
              key={option.value}
              presentation="custom"
              label={option.subtitle ? `${option.title}, ${option.subtitle}` : option.title}
              name={name}
              value={option.value}
              checked={chosen}
              onChange={() => onChange(option.value)}
              onClick={() => {
                if (!pointer.current) return;
                pointer.current = false;
                onPick?.(option.value);
              }}
              className={cn(
                "has-[:focus-visible]:-outline-offset-2",
                index > 0 && "border-t border-border",
              )}
            >
              <span
                data-choice-option={option.value}
                data-choice-selected={chosen ? "true" : undefined}
                {...option.data}
                className="flex min-h-14 items-center gap-3 px-3 py-2.5 hover:bg-surface-hover"
                onPointerDown={() => {
                  pointer.current = true;
                }}
                onPointerCancel={() => {
                  pointer.current = false;
                }}
              >
                {option.media ? (
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-sunken text-text-secondary"
                  >
                    {option.media}
                  </span>
                ) : null}
                <span aria-hidden="true" className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-text">
                    {option.title}
                  </span>
                  {option.subtitle ? (
                    <span className="block truncate text-caption text-text-muted">
                      {option.subtitle}
                    </span>
                  ) : null}
                </span>
                {chosen ? (
                  <CheckIcon size={20} className="shrink-0 text-action" />
                ) : null}
              </span>
            </Radio>
          );
        })}
      </div>
    </fieldset>
  );
}
