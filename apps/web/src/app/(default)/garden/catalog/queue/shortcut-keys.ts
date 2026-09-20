/**
 * The queue's keys, in one place (`OVE-459` AC2).
 *
 * `shortcuts.tsx` binds them and the page prints them, from this array, so the
 * list on screen cannot drift from the list that works. A shortcut the page
 * does not name is a shortcut only the person who wrote it has.
 */
export interface CatalogQueueKey {
  /** Lower-case `event.key`. */
  key: string;
  /** What it presses, and how the page finds that control. */
  target: "accept" | "reject" | "next" | "previous" | "undo";
}

export const CATALOG_QUEUE_KEYS: readonly CatalogQueueKey[] = [
  { key: "y", target: "accept" },
  { key: "n", target: "reject" },
  { key: "j", target: "next" },
  { key: "k", target: "previous" },
  { key: "u", target: "undo" },
];

/** The selector each key presses, so binding and proof agree. */
export function catalogQueueKeySelector(target: CatalogQueueKey["target"]) {
  switch (target) {
    case "accept":
    case "reject":
      return `[data-catalog-queue-action="${target}"]`;
    case "next":
    case "previous":
      return `[data-catalog-queue-nav="${target}"]`;
    case "undo":
      return "[data-catalog-automatic-undo]";
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}
