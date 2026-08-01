/**
 * Node 20 lacks Object.groupBy (ES2024). The repository runtime guard requires
 * Node 22+ for builds; this remains the one compatibility owner for isolated
 * Vitest and script imports that intentionally exercise an older runtime.
 */
export function ensureObjectGroupByPolyfill() {
  if (typeof Object.groupBy === "function") return;

  Object.groupBy = function groupBy<T, K extends PropertyKey>(
    items: Iterable<T>,
    keySelector: (item: T, index: number) => K,
  ): Partial<Record<K, T[]>> {
    const result: Partial<Record<K, T[]>> = {};
    let index = 0;
    for (const item of items) {
      const key = keySelector(item, index);
      const bucket = result[key] ?? [];
      bucket.push(item);
      result[key] = bucket;
      index += 1;
    }
    return result;
  };
}

ensureObjectGroupByPolyfill();
