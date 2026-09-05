/**
 * The one name normalizer of the organism graph (ADR-0026 D3), implemented
 * identically here, in `catalog_normalize_name` (SQL, migration 0054) and in
 * `services/matching/app/normalize_name.py`. All three are held to
 * `contracts/catalog/normalize-name.fixture.json`; the character tables below
 * are compared with `contracts/catalog/normalize-name.mapping.json` by
 * `normalize-name.test.ts`.
 *
 * Steps, in order:
 *   1. Unicode NFKC.
 *   2. Every Unicode space and control whitespace becomes an ASCII space.
 *   3. Lower case.
 *   4. Single-character folds: apostrophe variants to `'`, double-quote
 *      variants to a space, dash variants to `-`, the hybrid sign to `x`,
 *      Latin letters with diacritics to their base letter, and the Cyrillic
 *      folds ё→е, ґ→г, ѐ→е, ѝ→и.
 *   5. Multi-character folds: ß→ss, æ→ae, œ→oe, þ→th, ð→d.
 *   6. An apostrophe survives only between two characters that are neither a
 *      space, a hyphen, another apostrophe nor the string boundary, so a quoted
 *      cultivar name loses its quotes while м'ята keeps its apostrophe.
 *   7. Space runs collapse to one; the result is trimmed.
 *
 * Authorship is not stripped here; that is the scientific-name parser's job
 * in the worker. Nothing here truncates: callers cap the length they store.
 */

const SPACE_CODE_POINTS = [
  0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
  0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  0x0009, 0x000a, 0x000d, 0x000c, 0x000b,
] as const;

const APOSTROPHE_CODE_POINTS = [
  0x2019, 0x2018, 0x02bc, 0x02b9, 0x0060, 0x00b4, 0x2032, 0x201a,
] as const;

const DOUBLE_QUOTE_CODE_POINTS = [
  0x0022, 0x201c, 0x201d, 0x201e, 0x00ab, 0x00bb, 0x2033,
] as const;

const DASH_CODE_POINTS = [
  0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2212,
] as const;

const HYBRID_SIGN_CODE_POINTS = [0x00d7, 0x2715] as const;

const LATIN_FOLDS: Readonly<Record<string, readonly number[]>> = {
  a: [0x00e0, 0x00e1, 0x00e2, 0x00e3, 0x00e4, 0x00e5, 0x0101, 0x0103, 0x0105],
  c: [0x00e7, 0x0107, 0x0109, 0x010b, 0x010d],
  d: [0x010f, 0x0111],
  e: [0x00e8, 0x00e9, 0x00ea, 0x00eb, 0x0113, 0x0115, 0x0117, 0x0119, 0x011b],
  g: [0x011d, 0x011f, 0x0121, 0x0123],
  h: [0x0125, 0x0127],
  i: [0x00ec, 0x00ed, 0x00ee, 0x00ef, 0x0129, 0x012b, 0x012d, 0x012f, 0x0131],
  j: [0x0135],
  k: [0x0137],
  l: [0x013a, 0x013c, 0x013e, 0x0140, 0x0142],
  n: [0x00f1, 0x0144, 0x0146, 0x0148],
  o: [0x00f2, 0x00f3, 0x00f4, 0x00f5, 0x00f6, 0x00f8, 0x014d, 0x014f, 0x0151],
  r: [0x0155, 0x0157, 0x0159],
  s: [0x015b, 0x015d, 0x015f, 0x0161, 0x0219],
  t: [0x0163, 0x0165, 0x0167, 0x021b],
  u: [0x00f9, 0x00fa, 0x00fb, 0x00fc, 0x0169, 0x016b, 0x016d, 0x016f, 0x0171, 0x0173],
  w: [0x0175],
  y: [0x00fd, 0x00ff, 0x0177],
  z: [0x017a, 0x017c, 0x017e],
};

const CYRILLIC_FOLDS: Readonly<Record<number, number>> = {
  0x0451: 0x0435,
  0x0491: 0x0433,
  0x0450: 0x0435,
  0x045d: 0x0438,
};

const MULTI_CHARACTER_FOLDS: Readonly<Record<number, string>> = {
  0x00df: "ss",
  0x00e6: "ae",
  0x0153: "oe",
  0x00fe: "th",
  0x00f0: "d",
};

/** Every single-character fold, keyed by code point. */
export const NORMALIZE_NAME_SINGLE_CHARACTER_FOLDS: ReadonlyMap<number, string> =
  buildSingleCharacterFolds();

/** The multi-character folds, keyed by code point. */
export const NORMALIZE_NAME_MULTI_CHARACTER_FOLDS: ReadonlyMap<number, string> =
  new Map(
    Object.entries(MULTI_CHARACTER_FOLDS).map(([codePoint, replacement]) => [
      Number(codePoint),
      replacement,
    ]),
  );

/** The tables in the shape of `contracts/catalog/normalize-name.mapping.json`. */
export const NORMALIZE_NAME_MAPPING_TABLES = {
  space: SPACE_CODE_POINTS,
  apostrophe: APOSTROPHE_CODE_POINTS,
  doubleQuoteToSpace: DOUBLE_QUOTE_CODE_POINTS,
  dash: DASH_CODE_POINTS,
  hybridSign: HYBRID_SIGN_CODE_POINTS,
  latinFolds: LATIN_FOLDS,
  cyrillicFolds: CYRILLIC_FOLDS,
  multiCharacterFolds: MULTI_CHARACTER_FOLDS,
} as const;

function buildSingleCharacterFolds(): Map<number, string> {
  const folds = new Map<number, string>();
  for (const codePoint of SPACE_CODE_POINTS) folds.set(codePoint, " ");
  for (const codePoint of APOSTROPHE_CODE_POINTS) folds.set(codePoint, "'");
  for (const codePoint of DOUBLE_QUOTE_CODE_POINTS) folds.set(codePoint, " ");
  for (const codePoint of DASH_CODE_POINTS) folds.set(codePoint, "-");
  for (const codePoint of HYBRID_SIGN_CODE_POINTS) folds.set(codePoint, "x");
  for (const [base, codePoints] of Object.entries(LATIN_FOLDS)) {
    for (const codePoint of codePoints) folds.set(codePoint, base);
  }
  for (const [from, to] of Object.entries(CYRILLIC_FOLDS)) {
    folds.set(Number(from), String.fromCodePoint(to));
  }
  return folds;
}

const LEADING_APOSTROPHES = /(^|[ -])'+/g;
const TRAILING_APOSTROPHES = /'+([ -]|$)/g;
const SPACE_RUNS = / +/g;

/**
 * Normalizes a catalog name for matching and search. Pure, total, and
 * identical to `catalog_normalize_name` in SQL and `normalize_name` in Python.
 */
export function normalizeCatalogName(value: string): string {
  const lowered = value.normalize("NFKC").toLowerCase();
  let folded = "";
  for (const character of lowered) {
    const codePoint = character.codePointAt(0)!;
    const single = NORMALIZE_NAME_SINGLE_CHARACTER_FOLDS.get(codePoint);
    if (single !== undefined) {
      folded += single;
      continue;
    }
    const multi = NORMALIZE_NAME_MULTI_CHARACTER_FOLDS.get(codePoint);
    folded += multi ?? character;
  }
  return folded
    .replace(LEADING_APOSTROPHES, "$1")
    .replace(TRAILING_APOSTROPHES, "$1")
    .replace(SPACE_RUNS, " ")
    .trim();
}
