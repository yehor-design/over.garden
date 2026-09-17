"use client";

import { Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { controlVariants } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A text control that filters a list.
 *
 * It ships in two shapes on purpose. The **parts** — `ComboboxRoot`,
 * `ComboboxInput`, `ComboboxClear`, `ComboboxList`, `ComboboxOption` — own the
 * markup and the ARIA and nothing else, so a picker with its own asynchronous
 * behaviour (the gardener's catalogue picker, ADR-0026 D7) stops hand-rolling
 * an input without giving up its logic. The **`Combobox`** above them owns the
 * keyboard for the ordinary case: ArrowDown/ArrowUp move, Home/End jump, Enter
 * takes the active option, Escape closes and leaves focus in the input.
 *
 * Active option is `aria-activedescendant`, not focus: focus stays in the text
 * box so typing keeps working, which is what the combobox pattern requires.
 */

function ComboboxRoot({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="combobox"
      className={cn("relative block min-w-0", className)}
      {...props}
    />
  );
}

function ComboboxInput({
  className,
  "aria-expanded": expanded = false,
  "aria-controls": controls,
  ...props
}: Omit<React.ComponentProps<"input">, "size" | "type" | "role"> & {
  /** Required by the combobox role, so the part never renders without them. */
  "aria-controls": string;
}) {
  return (
    <>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
      />
      <input
        data-slot="combobox-input"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={controls}
        autoComplete="off"
        spellCheck={false}
        className={cn(controlVariants({ size: "md" }), "px-9", className)}
        {...props}
      />
    </>
  );
}

function ComboboxClear({
  className,
  label,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <IconButton
      data-slot="combobox-clear"
      label={label}
      size="sm"
      variant="ghost"
      className={cn("absolute top-1/2 right-1 -translate-y-1/2", className)}
      {...props}
    >
      <X />
    </IconButton>
  );
}

function ComboboxList({
  className,
  ...props
}: React.ComponentProps<"ul"> & { "aria-label": string }) {
  return (
    <ul
      data-slot="combobox-list"
      role="listbox"
      className={cn("grid gap-1", className)}
      {...props}
    />
  );
}

function ComboboxOption({
  className,
  active = false,
  selected = false,
  ...props
}: Omit<React.ComponentProps<"li">, "role"> & {
  active?: boolean;
  selected?: boolean;
}) {
  return (
    <li
      data-slot="combobox-option"
      role="option"
      aria-selected={selected}
      data-active={active || undefined}
      className={cn(
        "cursor-pointer rounded-md border border-border px-3 py-2 text-body-sm text-text",
        active && "border-action bg-action-subtle",
        className,
      )}
      {...props}
    />
  );
}

interface ComboboxOptionModel {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

function Combobox({
  id,
  name,
  value,
  onValueChange,
  onSelect,
  options,
  listLabel,
  clearLabel,
  emptyLabel,
  placeholder,
  disabled,
  required,
  className,
  ...props
}: Omit<
  React.ComponentProps<"input">,
  "size" | "type" | "role" | "value" | "onSelect"
> & {
  value: string;
  onValueChange: (value: string) => void;
  onSelect?: (option: ComboboxOptionModel) => void;
  options: readonly ComboboxOptionModel[];
  listLabel: string;
  clearLabel: string;
  emptyLabel?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectable = options.filter((option) => !option.disabled);
  const listVisible = open && options.length > 0;
  const activeOption = activeIndex >= 0 ? selectable[activeIndex] : undefined;

  const move = (delta: number) => {
    if (selectable.length === 0) return;
    setOpen(true);
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return selectable.length - 1;
      if (next >= selectable.length) return 0;
      return next;
    });
  };

  const take = (option: ComboboxOptionModel | undefined) => {
    if (!option) return;
    onValueChange(option.label);
    onSelect?.(option);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <ComboboxRoot className={className}>
      <ComboboxInput
        ref={inputRef}
        id={inputId}
        name={name}
        value={value}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        aria-expanded={listVisible}
        aria-controls={listboxId}
        aria-activedescendant={listVisible ? activeOption?.id : undefined}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          if (options.length > 0) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
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
          if (event.key === "Home" && listVisible) {
            event.preventDefault();
            setActiveIndex(0);
            return;
          }
          if (event.key === "End" && listVisible) {
            event.preventDefault();
            setActiveIndex(selectable.length - 1);
            return;
          }
          if (event.key === "Enter" && listVisible && activeOption) {
            event.preventDefault();
            take(activeOption);
            return;
          }
          if (event.key === "Escape") {
            // Escape closes the list and leaves focus where it was; it never
            // clears what the reader typed.
            event.preventDefault();
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
        {...props}
      />
      {value ? (
        <ComboboxClear
          label={clearLabel}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onValueChange("");
            setOpen(false);
            setActiveIndex(-1);
            inputRef.current?.focus();
          }}
        />
      ) : null}
      <ComboboxList
        id={listboxId}
        aria-label={listLabel}
        hidden={!listVisible}
        className="mt-1"
      >
        {selectable.map((option, index) => (
          <ComboboxOption
            key={option.id}
            id={option.id}
            active={index === activeIndex}
            selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => take(option)}
          >
            <span className="block font-medium">{option.label}</span>
            {option.description ? (
              <span className="block text-caption text-text-muted">
                {option.description}
              </span>
            ) : null}
          </ComboboxOption>
        ))}
      </ComboboxList>
      {open && options.length === 0 && emptyLabel ? (
        <p className="mt-1 text-caption text-text-muted">{emptyLabel}</p>
      ) : null}
    </ComboboxRoot>
  );
}

export {
  Combobox,
  ComboboxClear,
  ComboboxInput,
  ComboboxList,
  ComboboxOption,
  ComboboxRoot,
};
export type { ComboboxOptionModel };
