import { normalizeCatalogName } from "@/lib/catalog/normalize-name";

/**
 * The matching key of a cultivar or breed name (OVE-524): two names with one
 * key are one entry of a species' list, so a gardener typing «бичаче серце»
 * where «Бичаче серце» exists picks it rather than adding a second.
 *
 * The shared normalizer first (case, compatibility forms, apostrophes, `ё`),
 * then Ukrainian and Russian spellings of one sound folded together — `і`,
 * `ї` and `ы` read as `и`, `є` and `э` as `е`, `ъ`, `ь` and the apostrophe
 * dropped — and a hyphen read as a space. «Черокі» and «Чероки» are one key;
 * «Бичаче серце» and «Бычье сердце» are two words and stay two.
 *
 * `catalog_cultivar_key` (migration 0086) is the same function in SQL; the
 * writer that keeps one entry per name reads that one, and the proof script
 * holds the two to one fixture.
 */
export function cultivarNameKey(value: string): string {
  let folded = "";
  for (const character of normalizeCatalogName(value)) {
    if (character === "і" || character === "ї" || character === "ы") {
      folded += "и";
    } else if (character === "є" || character === "э") {
      folded += "е";
    } else if (character !== "ъ" && character !== "ь" && character !== "'") {
      folded += character;
    }
  }
  return folded.replace(/[\s-]+/gu, " ").trim();
}

/**
 * How a typed text finds a list row, best first: the same key, a key that
 * starts with it, one that contains it, then one a typo away from a word of
 * the row (one edit up to seven characters, two from eight). Null is no
 * match. Short queries are never fuzzy: two letters a typo apart are any two
 * letters.
 */
export function cultivarMatchRank(query: string, name: string): number | null {
  const q = cultivarNameKey(query);
  if (!q) return 3;
  const key = cultivarNameKey(name);
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  if (key.includes(q)) return 2;
  const length = Array.from(q).length;
  if (length < 4) return null;
  const allowed = length >= 8 ? 2 : 1;
  const words = key.split(" ");
  // A query of several words is matched against as many words of the row,
  // starting at each of them.
  const span = q.split(" ").length;
  for (let start = 0; start + span <= words.length; start += 1) {
    const window = words.slice(start, start + span).join(" ");
    const prefix = Array.from(window).slice(0, length).join("");
    if (editDistance(q, prefix, allowed) <= allowed) return 4;
    if (editDistance(q, window, allowed) <= allowed) return 4;
  }
  return null;
}

/**
 * Damerau–Levenshtein (optimal string alignment) distance, capped: past
 * `limit` the exact number does not matter, and the loop stops early.
 */
function editDistance(left: string, right: string, limit: number): number {
  const a = Array.from(left);
  const b = Array.from(right);
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previousPrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, previousPrevious[j - 2]! + 1);
      }
      current[j] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > limit) return limit + 1;
    previousPrevious = previous;
    previous = current;
  }
  return previous[b.length]!;
}
