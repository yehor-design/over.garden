"use client";

import { useEffect } from "react";

import {
  CATALOG_QUEUE_KEYS,
  catalogQueueKeySelector,
} from "./shortcut-keys";

/**
 * Keyboard shortcuts are an enhancement (ADR-0026 D10): they press the same
 * controls a pointer does — Y and N submit the decision forms, J and K follow
 * the prev/next links, U presses the most recent undo — so the queue is
 * complete before this runs and complete with JavaScript off.
 *
 * Every key comes from `shortcut-keys.ts`, which is also what the page prints
 * beside the controls. Neither list can gain a key the other does not have.
 */
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
      const shortcut = CATALOG_QUEUE_KEYS.find(
        (candidate) => candidate.key === key,
      );
      if (!shortcut) return;
      const control = document.querySelector<HTMLElement>(
        catalogQueueKeySelector(shortcut.target),
      );
      if (!control) return;
      event.preventDefault();
      control.click();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
