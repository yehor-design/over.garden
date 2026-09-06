/**
 * Catalog addresses (ADR-0026 D8).
 *
 * A species slug is the canonical scientific name without authorship, in
 * lower-case ASCII with `-` between words and `×` written as `x`. A form slug
 * is the registered denomination romanized: Ukrainian per the Cabinet of
 * Ministers resolution 55 of 2010 (with the positional rules for Є, Ї, Й, Ю,
 * Я, the omitted soft sign and apostrophe, and `зг` → `zgh`), Bulgarian per
 * the 2009 transliteration law, Latin-script names by folding diacritics.
 * Vernaculars never become slugs. A collision gets `-2`, `-3`; the history
 * table decides what is taken, so a slug is never reused.
 */

export type SlugLanguage = "uk" | "bg" | "latin";

const UKRAINIAN: Readonly<Record<string, string>> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  // Letters of neighbouring alphabets that reach a Ukrainian register row.
  ы: "y",
  э: "e",
  ё: "yo",
  ъ: "",
};

/** Letters whose romanization depends on the position in the word. */
const UKRAINIAN_POSITIONAL: Readonly<
  Record<string, { initial: string; elsewhere: string }>
> = {
  є: { initial: "ye", elsewhere: "ie" },
  ї: { initial: "yi", elsewhere: "i" },
  й: { initial: "y", elsewhere: "i" },
  ю: { initial: "yu", elsewhere: "iu" },
  я: { initial: "ya", elsewhere: "ia" },
};

const BULGARIAN: Readonly<Record<string, string>> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sht",
  ъ: "a",
  ь: "y",
  ю: "yu",
  я: "ya",
  // Neighbouring alphabets.
  і: "i",
  ї: "i",
  є: "e",
  ґ: "g",
  ы: "y",
  э: "e",
  ё: "yo",
};

const APOSTROPHES = /[’‘ʼʹ`´′']/gu;
const CYRILLIC_LETTER = /\p{Script=Cyrillic}/u;

/** Ukrainian romanization per resolution 55 (2010), letter case preserved. */
export function romanizeUkrainian(text: string): string {
  const source = text.normalize("NFC").replace(APOSTROPHES, "");
  const characters = Array.from(source);
  let output = "";
  let previous: string | null = null;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!;
    const lower = character.toLowerCase();
    const upper = character !== lower;
    const wordInitial = previous === null || !CYRILLIC_LETTER.test(previous);
    const next = characters[index + 1]?.toLowerCase();
    let romanized: string | null = null;
    if (lower === "з" && next === "г") {
      romanized = "zgh";
      index += 1;
    } else if (lower in UKRAINIAN_POSITIONAL) {
      const rule = UKRAINIAN_POSITIONAL[lower]!;
      romanized = wordInitial ? rule.initial : rule.elsewhere;
    } else if (lower in UKRAINIAN) {
      romanized = UKRAINIAN[lower]!;
    }
    if (romanized === null) {
      output += character;
    } else {
      output += upper ? capitalize(romanized) : romanized;
    }
    previous = character;
  }
  return output;
}

/** Bulgarian romanization per the 2009 transliteration law, case preserved. */
export function romanizeBulgarian(text: string): string {
  const source = text.normalize("NFC").replace(APOSTROPHES, "");
  const characters = Array.from(source);
  let output = "";
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!;
    const lower = character.toLowerCase();
    const upper = character !== lower;
    // Word-final "ия" is "ia" (София → Sofia).
    if (
      lower === "и" &&
      characters[index + 1]?.toLowerCase() === "я" &&
      !CYRILLIC_LETTER.test(characters[index + 2] ?? " ")
    ) {
      output += upper ? "Ia" : "ia";
      index += 1;
      continue;
    }
    const romanized = BULGARIAN[lower];
    if (romanized === undefined) {
      output += character;
    } else {
      output += upper ? capitalize(romanized) : romanized;
    }
  }
  return output;
}

/** Lower-case ASCII, words joined with `-`, `×` as `x`, nothing else. */
export function toAsciiSlug(text: string): string {
  return text
    // Compatibility decomposition would spell № as "No"; it is a separator.
    .replace(/[№#]/gu, " ")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[×✕]/gu, "x")
    .replace(/[Øø]/gu, "o")
    .replace(/[Łł]/gu, "l")
    .replace(/[ß]/gu, "ss")
    .replace(/[Ææ]/gu, "ae")
    .replace(/[Œœ]/gu, "oe")
    .replace(/[ÐðĐđ]/gu, "d")
    .replace(/[Þþ]/gu, "th")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/** The species slug: the scientific name without authorship. */
export function speciesSlugFromScientificName(scientificName: string): string {
  return toAsciiSlug(scientificName);
}

/** The form slug: the registered denomination, romanized. */
export function formSlugFromDenomination(
  denomination: string,
  language: SlugLanguage = "uk",
): string {
  const romanized =
    language === "uk"
      ? romanizeUkrainian(denomination)
      : language === "bg"
        ? romanizeBulgarian(denomination)
        : denomination;
  return toAsciiSlug(romanized);
}

export function isCatalogSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

/**
 * The first free slug for a base: the base itself, then `-2`, `-3`, …
 * `taken` is every slug ever assigned in the namespace, so a retired slug is
 * never handed to another organism.
 */
export function resolveSlugCollision(
  base: string,
  taken: ReadonlySet<string>,
): string {
  if (!isCatalogSlug(base)) throw new Error(`Not a catalog slug: ${base}`);
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`No free slug for ${base}`);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
