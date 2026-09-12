/**
 * Catalog addresses (ADR-0026 D8, ADR-0029 D4).
 *
 * A species slug is the accepted scientific name without authorship; a form
 * slug is the registered denomination romanized. Vernaculars never become
 * slugs. Both are `latin` namespaces in `src/lib/address/address-manifest.ts`,
 * and both go through the one slugifier — this file is the catalog's façade
 * over it, naming the fallback each namespace wants and nothing else.
 *
 * It used to hold `toAsciiSlug`, which normalized with `NFKD` and stripped the
 * combining marks. That is harmless for a Latin denomination and destructive
 * for anything Cyrillic, and copying it is how a journal title lost its `ї`.
 * The romanization tables it also held moved to `@/lib/address/romanize`.
 */

import { slugify } from "@/lib/address/slugify";

export {
  romanizeBulgarian,
  romanizeUkrainian,
  type SlugLanguage,
} from "@/lib/address/romanize";
export {
  resolveAddressCollision as resolveSlugCollision,
} from "@/lib/address/slugify";

import type { SlugLanguage } from "@/lib/address/romanize";

/**
 * A trailing botanical or zoological authority: `L.`, `Mill.`, `DC.`
 *
 * Capitalised and ending in a full stop, which is what separates an authority
 * from the rank abbreviations that are part of the name — `sp.`, `subsp.`,
 * `var.`, `f.` are lower case and stay. Deliberately conservative: it strips a
 * single trailing token and leaves `Duchesne ex Rozier` alone, because a name
 * this rule does not recognise keeps a slug that is merely long, while a rule
 * that guessed would silently rename a species.
 */
const TRAILING_AUTHORITY = /\s+\(?[A-Z][A-Za-z]*\.\)?$/u;

/**
 * The species slug: the scientific name **without authorship** (ADR-0026 D8).
 *
 * The authority was never stripped, so `Solanum lycopersicum L.` would have
 * become `solanum-lycopersicum-l` — an address with a botanist's initial in
 * it. Four rows in the production catalog carry a short authority, and all
 * four are the seeded species the launch corpus is built on; the bare names
 * they should have had are free.
 */
export function speciesSlugFromScientificName(scientificName: string): string {
  return slugify(scientificName.replace(TRAILING_AUTHORITY, ""), {
    script: "latin",
    language: "latin",
    fallback: "species",
  });
}

/** The form slug: the registered denomination, romanized. */
export function formSlugFromDenomination(
  denomination: string,
  language: SlugLanguage = "uk",
): string {
  return slugify(denomination, {
    script: "latin",
    language,
    fallback: "variety",
  });
}
