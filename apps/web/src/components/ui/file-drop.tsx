"use client";

import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The one place a `<input type="file">` lives.
 *
 * Two presentations, because the product needs two:
 *
 * - **`trigger`** — the input is hidden and something else opens it. This is
 *   what the journal composer and the Lexical image node already do, and the
 *   `ref` goes straight to the input so `ref.current.click()` keeps working.
 *   It changes no selection semantics: the component hands the caller the same
 *   `FileList` the browser produced.
 * - **`zone`** — a labelled drop area. The real input is the control: it stays
 *   in the tab order and Enter or Space opens the picker, which is the only
 *   shape that works for a keyboard. Drag-and-drop is the enhancement on top,
 *   never the only way in.
 */
type FileDropProps = Omit<React.ComponentProps<"input">, "type" | "size"> & {
  /** The control's accessible name, and the zone's visible label. */
  label: string;
  hint?: React.ReactNode;
  presentation?: "trigger" | "zone";
  onSelectFiles?: (files: File[]) => void;
};

function FileDrop({
  className,
  label,
  hint,
  presentation = "trigger",
  onSelectFiles,
  onChange,
  disabled,
  ref,
  ...props
}: FileDropProps) {
  const [dragging, setDragging] = useState(false);
  const zoneInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(event);
    onSelectFiles?.(Array.from(event.currentTarget.files ?? []));
  };

  if (presentation === "trigger") {
    return (
      <input
        ref={ref}
        data-slot="file-drop"
        type="file"
        aria-label={label}
        disabled={disabled}
        className={cn("hidden", className)}
        onChange={handleChange}
        {...props}
      />
    );
  }

  return (
    <label
      data-slot="file-drop"
      data-dragging={dragging || undefined}
      className={cn(
        "grid justify-items-center gap-2 rounded-lg border border-dashed border-border-control p-6 text-center text-body-sm",
        "transition-colors duration-instant ease-out",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
        dragging && "border-action bg-action-subtle",
        disabled
          ? "cursor-not-allowed bg-surface-sunken text-text-disabled"
          : "cursor-pointer text-text hover:bg-surface-hover",
        className,
      )}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length === 0) return;
        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(file);
        if (zoneInputRef.current) {
          zoneInputRef.current.files = transfer.files;
        }
        onSelectFiles?.(files);
      }}
    >
      <UploadCloud aria-hidden="true" className="size-6 text-text-muted" />
      <span className="font-medium">{label}</span>
      {hint ? (
        <span className="text-caption text-text-muted">{hint}</span>
      ) : null}
      <input
        ref={(node) => {
          zoneInputRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        type="file"
        aria-label={label}
        disabled={disabled}
        className="sr-only"
        onChange={handleChange}
        {...props}
      />
    </label>
  );
}

export { FileDrop };
export type { FileDropProps };
