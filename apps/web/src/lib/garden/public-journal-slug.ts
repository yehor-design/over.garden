/**
 * OVE-227 — canonical public journal slug rule.
 *
 * The slug is part of the public route contract (`/journal/<slug>`) and of the
 * public Meilisearch projection. Before this module the rule lived only inside
 * `journal-repository.ts`, so the search parity gate could not tell a valid
 * slug from an attacker-shaped or truncated one. Both the write path and the
 * projection comparison now read the same definition.
 */

export const MAX_PUBLIC_JOURNAL_SLUG_LENGTH = 96;

/**
 * Letters (any script, so Ukrainian/Bulgarian titles survive), digits, and
 * hyphens only. No slashes, dots, whitespace, query, or fragment characters —
 * those would let a slug escape its own route segment.
 */
const PUBLIC_JOURNAL_SLUG_PATTERN = /^[\p{Letter}\p{Number}-]+$/u;

export function isValidPublicJournalSlug(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0) return false;
  if (value.length > MAX_PUBLIC_JOURNAL_SLUG_LENGTH) return false;
  return PUBLIC_JOURNAL_SLUG_PATTERN.test(value);
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
