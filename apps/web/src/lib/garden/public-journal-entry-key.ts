/**
 * How a request names an entry (ADR-0029 D9, amendment of 2026-09-18).
 *
 * `number` is the address: the author's handle and the entry's place in the
 * author's own count. `name` is every address the entry had before that — the
 * slug, with the handle when the request carried one (`/@{handle}/{slug}`) and
 * without it for the flat `/journal/{slug}`, where a slug can name more than
 * one entry since migration `0073` and `resolveJournalEntryAddress` decides
 * which.
 *
 * It lives here rather than beside the queries that read it because the proxy
 * builds one on every entry request, and the proxy reaches the repository
 * only through a dynamic import it would rather not make for a constructor.
 */
export type PublicJournalEntryKey =
  | {
      readonly kind: "number";
      readonly authorHandle: string;
      readonly entryNumber: number;
    }
  | {
      readonly kind: "name";
      readonly publicSlug: string;
      readonly authorHandle: string | null;
    };

export function publicJournalEntryNumberKey(
  authorHandle: string,
  entryNumber: number,
): PublicJournalEntryKey {
  return { kind: "number", authorHandle, entryNumber };
}

export function publicJournalEntryNameKey(
  publicSlug: string,
  authorHandle: string | null = null,
): PublicJournalEntryKey {
  return { kind: "name", publicSlug, authorHandle };
}
