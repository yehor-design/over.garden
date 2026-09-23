"use client";

import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

import { CATALOG_QUEUE_KEYS, catalogQueueKeySelector } from "./shortcut-keys";

const STORAGE_KEY = "overgarden:catalog-queue-shortcuts";

type ShortcutPreference = "on" | "off";

/**
 * The owner's choice, kept in this browser. A browser that refuses storage
 * still gets the switch for the visit: the choice then lives here.
 */
let unstoredPreference: ShortcutPreference | null = null;
const listeners = new Set<() => void>();

function readPreference(): ShortcutPreference {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "off" ? "off" : "on";
  } catch {
    return unstoredPreference ?? "on";
  }
}

function writePreference(preference: ShortcutPreference) {
  try {
    if (preference === "on") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, "off");
  } catch {
    unstoredPreference = preference;
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Keyboard shortcuts are an enhancement (ADR-0026 D10): they press the same
 * controls a pointer does — Y and N submit the decision forms, J and K follow
 * the prev/next links, U presses the most recent undo — so the queue is
 * complete before this runs and complete with JavaScript off.
 *
 * Every key comes from `shortcut-keys.ts`, which is also what the page prints
 * beside the controls. Neither list can gain a key the other does not have.
 *
 * They are single letters, so they can be switched off (`OVE-506`,
 * WCAG 2.1.4): a screen reader's own letter commands, or speech input that
 * types a word, must not decide a queue item. The choice is remembered in
 * this browser. A held key decides once — its repeats are ignored — so a
 * lingering Y cannot accept the next item as it arrives.
 */
export function CatalogQueueShortcuts({
  labels,
}: {
  labels: { on: string; off: string; turnOn: string; turnOff: string };
}) {
  // The server knows nothing of this browser's choice, and before the bundle
  // runs no key works: until then the switch is not drawn at all.
  const preference = useSyncExternalStore<ShortcutPreference | null>(
    subscribe,
    readPreference,
    () => null,
  );
  const enabled = preference === "on";

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
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
  }, [enabled]);

  if (preference === null) return null;

  return (
    <p
      className="flex flex-wrap items-center gap-2 text-caption text-text-muted"
      data-catalog-queue-shortcuts={preference}
    >
      <span>{enabled ? labels.on : labels.off}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-catalog-queue-shortcuts-toggle="true"
        onClick={() => writePreference(enabled ? "off" : "on")}
      >
        {enabled ? labels.turnOff : labels.turnOn}
      </Button>
    </p>
  );
}
