"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { CheckIcon } from "@/components/icons/Check";
import {
  ComboboxClear,
  ComboboxInput,
  ComboboxList,
  ComboboxOption,
  ComboboxRoot,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

export interface ChoiceSearchOption {
  /** Stable across renders: what `onChoose` receives. */
  key: string;
  title: string;
  subtitle?: string | null;
  /** A round glyph before the title, as Threads' search rows draw one. */
  glyph?: ReactNode;
  /** `data-*` attributes for the option, for the browser specs. */
  data?: Record<`data-${string}`, string>;
}

/**
 * A search field over one list of answers (DESIGN.md §5.28): the object
 * stepper's «Вид» and «Сорт» / «Порода». The list is always there — the
 * default answer first («Не знаю»), what the search found in the middle, the
 * own-variant answer last — so a failed or empty search never leaves the step
 * without an answer. It is the combobox pattern with an inline, always
 * visible listbox: focus stays in the text box, the highlighted row is
 * `aria-activedescendant`, the chosen one is `aria-selected` and carries a
 * check.
 *
 * - **Enter takes only a highlighted row** (OVE-524). With nothing
 *   highlighted and something typed, Enter does nothing — it neither picks the
 *   first result nor moves the step on around a half-typed word. With the
 *   field empty it submits the step, like any other field.
 * - Arrow keys, Home and End move the highlight; Escape drops it, and with
 *   nothing highlighted is left to the stepper (which asks before closing).
 * - Threads' rows: one surface split by hairlines, a round glyph, the name in
 *   weight and one muted line beneath.
 */
export function ChoiceSearchList({
  inputLabel,
  placeholder,
  query,
  onQueryChange,
  clearLabel,
  options,
  selectedKey,
  onChoose,
  listLabel,
  status,
  statusTone = "muted",
  statusState,
  maxLength = 120,
  inputData,
}: {
  /** The search field's accessible name; the step's question is its heading. */
  inputLabel: string;
  placeholder?: string;
  query: string;
  onQueryChange: (value: string) => void;
  clearLabel: string;
  options: readonly ChoiceSearchOption[];
  selectedKey: string | null;
  onChoose: (key: string) => void;
  listLabel: string;
  /** The live line under the list: searching, found, nothing, unavailable. */
  status?: string;
  statusTone?: "muted" | "danger";
  statusState?: string;
  maxLength?: number;
  inputData?: Record<`data-${string}`, string>;
}) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const statusId = `${inputId}-status`;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeIndex = activeKey
    ? options.findIndex((option) => option.key === activeKey)
    : -1;
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;
  const optionId = (key: string) => `${listboxId}-${key.replace(/[^\w-]/gu, "_")}`;

  function move(delta: number) {
    if (options.length === 0) return;
    const next =
      activeIndex < 0
        ? delta > 0
          ? 0
          : options.length - 1
        : (activeIndex + delta + options.length) % options.length;
    setActiveKey(options[next]!.key);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === "Home" && options.length > 0 && activeIndex >= 0) {
      event.preventDefault();
      setActiveKey(options[0]!.key);
      return;
    }
    if (event.key === "End" && options.length > 0 && activeIndex >= 0) {
      event.preventDefault();
      setActiveKey(options[options.length - 1]!.key);
      return;
    }
    if (event.key === "Enter") {
      if (activeOption) {
        event.preventDefault();
        onChoose(activeOption.key);
        setActiveKey(null);
      } else if (query.trim()) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === "Escape" && activeOption) {
      event.preventDefault();
      setActiveKey(null);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2" data-choice-search="true">
      <label htmlFor={inputId} className="sr-only">
        {inputLabel}
      </label>
      <ComboboxRoot>
        <ComboboxInput
          id={inputId}
          aria-expanded={true}
          aria-controls={listboxId}
          aria-activedescendant={
            activeOption ? optionId(activeOption.key) : undefined
          }
          aria-describedby={status ? statusId : undefined}
          maxLength={maxLength}
          value={query}
          placeholder={placeholder}
          enterKeyHint="search"
          onChange={(event) => {
            onQueryChange(event.target.value.slice(0, maxLength));
            setActiveKey(null);
          }}
          onKeyDown={onKeyDown}
          {...inputData}
        />
        {query ? (
          <ComboboxClear
            type="button"
            label={clearLabel}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onQueryChange("");
              setActiveKey(null);
            }}
          />
        ) : null}
      </ComboboxRoot>
      <ComboboxList
        id={listboxId}
        aria-label={listLabel}
        className="gap-0 overflow-hidden rounded-lg border border-border bg-surface"
      >
        {options.map((option) => {
          const chosen = option.key === selectedKey;
          const active = option.key === activeOption?.key;
          return (
            <ComboboxOption
              key={option.key}
              id={optionId(option.key)}
              active={active}
              selected={chosen}
              data-choice-option={option.key}
              data-choice-selected={chosen ? "true" : undefined}
              {...option.data}
              className={cn(
                "flex min-h-14 w-full items-center gap-3 rounded-none border-0 border-b border-border px-3 py-2.5 text-left last:border-b-0",
                active && "border-b-border bg-surface-hover",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChoose(option.key);
                setActiveKey(null);
              }}
            >
              {option.glyph ? (
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-secondary"
                >
                  {option.glyph}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
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
                <CheckIcon
                  aria-hidden="true"
                  size={20}
                  className="shrink-0 text-action"
                />
              ) : null}
            </ComboboxOption>
          );
        })}
      </ComboboxList>
      {status !== undefined ? (
        <p
          id={statusId}
          aria-live="polite"
          data-choice-status={statusState}
          className={
            statusTone === "danger"
              ? "text-caption text-danger-text"
              : "text-caption text-text-muted"
          }
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}
