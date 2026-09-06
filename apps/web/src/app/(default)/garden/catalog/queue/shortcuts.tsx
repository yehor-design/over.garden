"use client";

import { useEffect } from "react";

/**
 * Keyboard shortcuts are an enhancement (ADR-0026 D10): they submit the same
 * forms the buttons do, so the queue is complete before this runs and
 * complete with JavaScript off.
 */
const SHORTCUTS: Record<string, string> = {
  y: "accept",
  n: "reject",
};

/** J and K follow the prev/next links, which exist without JavaScript. */
const NAVIGATION: Record<string, string> = {
  j: "next",
  k: "previous",
};

export function CatalogQueueShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "u") {
        const undo = document.querySelector<HTMLButtonElement>(
          "[data-catalog-automatic-undo]",
        );
        if (undo) {
          event.preventDefault();
          undo.click();
        }
        return;
      }
      const move = NAVIGATION[key];
      if (move) {
        const link = document.querySelector<HTMLAnchorElement>(
          `[data-catalog-queue-nav="${move}"]`,
        );
        if (link) {
          event.preventDefault();
          link.click();
        }
        return;
      }
      const action = SHORTCUTS[key];
      if (!action) return;
      const button = document.querySelector<HTMLButtonElement>(
        `[data-catalog-queue-action="${action}"]`,
      );
      if (!button) return;
      event.preventDefault();
      button.click();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
