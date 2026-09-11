import {
  ADDRESS_ALPHABETS,
  DEFAULT_ADDRESS_BUDGET,
  type AddressBudget,
  type AddressNamespace,
  type AddressScript,
} from "@/lib/address/address-manifest";
import { isAddressSlug } from "@/lib/address/address-contract.generated";
import { romanizeBulgarian, romanizeUkrainian } from "@/lib/address/romanize";

/**
 * One slugifier (ADR-0029 D4, D5). Five replaced it; each of the five was
 * wrong in its own way.
 *
 * The rule that matters most is the first line of the pipeline: **`NFC`,
 * never `NFKD`**. Compatibility decomposition splits `й` into `и` plus a
 * combining breve and `ї` into `і` plus a combining diaeresis; the mark is
 * then not a letter, so the separator pass turns it into a hyphen and the
 * trim swallows it. That is the whole of how
 * `Полив без календарної пастки` used to become
 * `полив-без-календарноі-пастки-5364380c26`. Nothing here ever decomposes a
 * character that the target alphabet already admits.
 */

export type SlugifyLanguage = "uk" | "bg" | "ru" | "latin";

export interface SlugifyOptions {
  readonly script: AddressScript;
  /**
   * The language the text is written in. It picks the romanization table for
   * a `latin` slug and the casing rules for every slug. Lower-casing is
   * locale-aware on purpose: `toLocaleLowerCase("en")` is a different function
   * from the reader's own, and hard-coding one language's casing into every
   * other language's addresses is how `İ` becomes `i` where it should not.
   */
  readonly language: SlugifyLanguage;
  readonly budget?: AddressBudget;
  /**
   * What to answer when nothing survives — a title written entirely in a
   * script this alphabet does not hold, or made of punctuation. Required
   * rather than defaulted, because the right word differs by namespace and an
   * empty slug is not a legal address anywhere.
   */
  readonly fallback: string;
}

/**
 * Every apostrophe a keyboard produces, plus the two modifier letters that
 * look like one. Dropped **before** the separator pass, not with it:
 * `зав'язування` is one word, and treating the apostrophe as a separator
 * spells it `зав-язування`, which is two.
 */
const APOSTROPHES = /['‘’ʼʹʻ`´′]/gu;

/**
 * Characters no decomposition reaches, folded by hand. `×` is a multiplication
 * sign rather than a letter `x`, and it is in every hybrid's scientific name;
 * `№` and `#` are separators rather than the letters `N`, `o` that a
 * compatibility decomposition would spell them as.
 */
const HAND_FOLDED: Readonly<Record<string, string>> = {
  "×": "x",
  "✕": "x",
  ø: "o",
  ł: "l",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ð: "d",
  đ: "d",
  þ: "th",
  "№": " ",
  "#": " ",
};

const COMBINING_MARK = /\p{M}/gu;

export function slugify(text: string, options: SlugifyOptions): string {
  const alphabet = ADDRESS_ALPHABETS[options.script];
  const admits = new RegExp(`^[${alphabet}]$`, "u");
  const budget = options.budget ?? DEFAULT_ADDRESS_BUDGET;

  const withoutApostrophes = text.normalize("NFC").replace(APOSTROPHES, "");
  const romanized =
    options.script === "latin"
      ? romanizeForLatin(withoutApostrophes, options.language)
      : withoutApostrophes;
  // Lower-casing can leave a string denormalized, so NFC is applied again
  // rather than assumed to have survived.
  const lowered = lowerCase(romanized, options.language).normalize("NFC");

  let assembled = "";
  for (const character of lowered) {
    const folded = foldToAlphabet(character, admits);
    assembled += folded ?? "-";
  }

  const collapsed = assembled
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  const truncated = truncateToBudget(collapsed, budget);
  return truncated || options.fallback;
}

/**
 * The `taken` set `resolveSlugCollision` starts from, seeded with whatever the
 * namespace reserves. A reserved word is not "invalid" — it is taken, by a
 * route segment rather than by another organism — so it belongs in the same
 * set as the slugs already issued, and the counter walks past it the same way.
 */
export function reservedAsTaken(
  reservedWords: readonly string[],
  taken: Iterable<string> = [],
): Set<string> {
  return new Set([...reservedWords, ...taken]);
}

function romanizeForLatin(text: string, language: SlugifyLanguage): string {
  if (language === "uk") return romanizeUkrainian(text);
  if (language === "bg" || language === "ru") return romanizeBulgarian(text);
  return text;
}

function lowerCase(text: string, language: SlugifyLanguage): string {
  return language === "latin"
    ? text.toLowerCase()
    : text.toLocaleLowerCase(language);
}

/**
 * One character, as the alphabet can hold it, or `null` when it cannot hold
 * it at all.
 *
 * The order is what keeps `й` intact: a character the alphabet already admits
 * is returned untouched and never reaches the decomposition below it. Only a
 * character the alphabet rejects is decomposed, and then only to see whether
 * stripping its marks lands inside the alphabet — which is how `é` becomes
 * `e` without `ї` becoming `i`.
 */
function foldToAlphabet(character: string, admits: RegExp): string | null {
  if (admits.test(character)) return character;

  const handFolded = HAND_FOLDED[character];
  if (handFolded !== undefined) {
    return [...handFolded].every((part) => admits.test(part) || part === " ")
      ? handFolded.replace(/ /gu, "-")
      : null;
  }

  const stripped = character.normalize("NFD").replace(COMBINING_MARK, "");
  if (stripped.length === 0) return null;
  return [...stripped].every((part) => admits.test(part)) ? stripped : null;
}

/** Decoded and encoded length both hold; whichever binds first wins (D5). */
export function fitsAddressBudget(
  value: string,
  budget: AddressBudget,
): boolean {
  return (
    [...value].length <= budget.decodedCharacters &&
    encodeURIComponent(value).length <= budget.encodedCharacters
  );
}

/**
 * Cut at the last hyphen that fits, so a truncated slug still ends on a whole
 * word. A first word that overflows on its own is cut mid-word instead, which
 * is ugly and still an address; returning nothing is not.
 */
function truncateToBudget(slug: string, budget: AddressBudget): string {
  if (fitsAddressBudget(slug, budget)) return slug;

  const words = slug.split("-");
  let assembled = "";
  for (const word of words) {
    const next = assembled ? `${assembled}-${word}` : word;
    if (!fitsAddressBudget(next, budget)) break;
    assembled = next;
  }
  if (assembled) return assembled;

  let cut = "";
  for (const character of words[0] ?? "") {
    const next = cut + character;
    if (!fitsAddressBudget(next, budget)) break;
    cut = next;
  }
  return cut;
}

/**
 * The first free slug for a base: the base itself, then `-2`, `-3`, … (D6).
 *
 * `taken` is every slug the namespace has issued, not only the live ones, so a
 * retired address is never handed to a second organism — the 308 it answers
 * with has to keep meaning what it meant. There is no hash and no UUID tail
 * anywhere in here: a random suffix destroys the only thing the slug was for.
 */
export function resolveAddressCollision(
  namespace: AddressNamespace,
  base: string,
  taken: ReadonlySet<string>,
): string {
  if (!isAddressSlug(namespace, base)) {
    throw new Error(`Not a ${namespace} slug: ${base}`);
  }
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`No free slug for ${base}`);
}
