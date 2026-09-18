/**
 * The URL vocabulary every filtered public listing speaks.
 *
 * Fixed by `OVE-448` for `/journals` and reused by `OVE-451` for the organism
 * catalogue, which is why it lives here rather than inside either page:
 *
 * - **One query parameter per facet, named for the facet.** `topic=winter-care`,
 *   not `f=topic:winter-care` and not `filters=eyJ0b3BpYyI6…`. A packed
 *   parameter is unreadable, unguessable and impossible to hand-edit, and it
 *   makes every consumer of the URL — a crawler, an analytics report, a person
 *   sharing a link — carry a decoder.
 * - **Repeated for multi-select.** `topic=a&topic=b`, in the order the reader
 *   chose them. Never comma-joined: a comma is a legal character in a slug in
 *   some namespaces, and "split on comma" is a bug waiting for the first one.
 * - **Absent means unset.** There is no `topic=all` and no `topic=`. A default
 *   is expressed by the parameter not being there, so the canonical address of
 *   an unfiltered listing is the listing's own path with no query at all.
 * - **`sort` and `page` are the two reserved names**, and they are dropped when
 *   they hold the listing's default — `page=1` is the listing, not a view of it.
 *
 * The rule this vocabulary exists to enforce: a filter that works but is absent
 * from the URL passes every interaction test and fails the moment a reader
 * shares the link, which is the whole job of a directory page.
 */

/** The two names a listing may use that are not facets. */
export const RESERVED_LISTING_PARAMETERS = ["sort", "page"] as const;

export type ListingParameterValue =
  | string
  | number
  | readonly string[]
  | null
  | undefined;

/**
 * One listing address, built from a path and the facets that are set.
 *
 * Ordering is the caller's: the object's own key order is preserved, so two
 * requests that mean the same view produce the same string and the cache, the
 * canonical and the analytics report agree. An empty string, `null` and
 * `undefined` are all "unset" and emit nothing.
 */
export function buildListingHref(
  path: string,
  parameters: Readonly<Record<string, ListingParameterValue>>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) search.set(key, String(value));
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) search.set(key, trimmed);
      continue;
    }
    for (const item of value) {
      const trimmed = item.trim();
      if (trimmed) search.append(key, trimmed);
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Every value a facet holds in a request, in the order the URL carried them.
 *
 * Accepts what a Next.js `searchParams` hands a page — a string, an array of
 * them, or nothing — so a page reads a single-select and a multi-select facet
 * the same way and cannot accidentally treat the first of several as the whole.
 */
export function readListingFacet(
  value: string | readonly string[] | undefined,
): string[] {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  for (const item of values) {
    const trimmed = typeof item === "string" ? item.trim() : "";
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}
