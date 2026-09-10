"use client";

import { useEffect, useRef } from "react";

/**
 * The 2 px line that says where a dragged block or a dropped photo will land.
 * Its offset is written to the element's transform rather than to a style
 * prop, because inline `style` props are banned in this codebase and a class
 * cannot carry a measured pixel value.
 */
export function JournalInsertionLine({
  top,
  purpose,
}: {
  top: number | null;
  /** Two lines exist in the canvas; a test has to be able to tell them apart. */
  purpose: "reorder" | "drop";
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || top === null) return;
    element.style.transform = `translateY(${top}px)`;
  }, [top]);

  return (
    <div
      ref={ref}
      data-journal-insertion-line={purpose}
      data-lexical-reorder-indicator={
        purpose === "reorder" ? "true" : undefined
      }
      className="pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-primary motion-reduce:transition-none forced-colors:border-t-2"
      hidden={top === null}
    />
  );
}
