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

/** The species slug: the scientific name without authorship. */
export function speciesSlugFromScientificName(scientificName: string): string {
  return slugify(scientificName, {
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
