/**
 * The public journal slug, as the route contract holds it.
 *
 * OVE-227 put the rule here so that the write path and the search-parity gate
 * read one definition instead of two. OVE-425 took the last copy out of this
 * file as well: the shape is now the address manifest's, rendered once into
 * the guard below and into `journal_entries_public_slug_check` (migration
 * `0068`), so a slug the database would refuse can no longer look valid to the
 * proxy — and the other way round.
 *
 * What narrowed. The old pattern was `[\p{Letter}\p{Number}-]+`, which admits
 * every script, upper case, a leading or trailing hyphen and a doubled one.
 * None of those is a slug this system ever issued, and each is a second
 * address for a page that already has one. Every slug production holds passes
 * the new guard unchanged.
 */

import {
  ADDRESS_SLUG_MAX_CHARACTERS,
  isAddressSlug,
} from "@/lib/address/address-contract.generated";

export const MAX_PUBLIC_JOURNAL_SLUG_LENGTH =
  ADDRESS_SLUG_MAX_CHARACTERS.journalEntry;

export function isValidPublicJournalSlug(value: unknown): value is string {
  return isAddressSlug("journalEntry", value);
}

/** Trim-normalize an inbound slug, or `null` when it cannot be canonical. */
export function normalizePublicJournalSlug(value: string): string | null {
  const encoded = value.trim();
  try {
    const normalized = decodeURIComponent(encoded);
    return isValidPublicJournalSlug(normalized) ? normalized : null;
  } catch {
    return null;
  }
}
