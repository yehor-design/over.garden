/**
 * Romanization, as two states wrote it down.
 *
 * Ukrainian follows the Cabinet of Ministers resolution 55 of 2010, with the
 * positional rules for Є, Ї, Й, Ю, Я, the omitted soft sign and apostrophe,
 * and `зг` as `zgh`. Bulgarian follows the 2009 transliteration law, including
 * the word-final `ия` that makes София Sofia. Neither is a transliteration
 * this repository invented, and neither is a slug: both preserve case and
 * return ordinary text, which `slugify` then makes into an address.
 *
 * A Russian denomination is romanized with the Bulgarian table. The two
 * alphabets differ in four letters, every one of which the table already
 * carries, and no state has published a rule for a Russian name in a Ukrainian
 * register.
 *
 * Moved here from `src/lib/catalog/slugs.ts` in OVE-425: romanization is part
 * of the address law, and leaving it under `catalog/` is what let a second,
 * worse slugifier grow beside it.
 */

/** Kept for the catalog façade; the slugifier speaks `SlugifyLanguage`. */
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

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
