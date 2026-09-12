import { PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE } from "@/server/public-journal-directory-query";
import { PUBLIC_OBJECT_CATALOG_PAGE_SIZE } from "@/server/public-object-catalog-repository";
import { stripLocalePrefix } from "@/lib/public-localization";

/**
 * Which listings paginate, and what a request asked for.
 *
 * Split from the count in `@/server/public-listing-bounds` so the proxy can
 * ask both questions without importing anything `server-only`, and can skip
 * the database entirely for page one — which is almost every request.
 */
const PAGINATED_LISTINGS: Readonly<Record<string, number>> = {
  "/journals": PUBLIC_JOURNAL_DIRECTORY_PAGE_SIZE,
  "/objects": PUBLIC_OBJECT_CATALOG_PAGE_SIZE,
};

/**
 * Listings whose filters are views of one address rather than addresses of
 * their own.
 *
 * The catalog's front door is the only one so far (ADR-0029 D13 item 2): a
 * kingdom and an initial narrow `/species`, every one of those views carries
 * `/species` as its canonical (D10), and a letter nobody has filed anything
 * under is an empty listing that must not be indexed. None of that can be said
 * in the page's own `<head>` — the same reason page two cannot, below — so it
 * is said here.
 *
 * `page` is in this list rather than in `PAGINATED_LISTINGS` on purpose. That
 * table also drives `isListingPageBeyondTheEnd`, which bounds every listing by
 * the *journal entry* count — eleven of them, one page of sixty — and putting
 * `/species` there would 404 a browse page that legitimately has hundreds. The
 * browse route knows its own count and answers that bound itself.
 */
const FILTERED_LISTINGS: Readonly<Record<string, readonly string[]>> = {
  "/species": ["kingdom", "letter", "page"],
};

export function paginatedListingPageSize(pathname: string): number | null {
  const path = stripLocalePrefix(pathname).path.replace(/\/+$/u, "") || "/";
  return PAGINATED_LISTINGS[path] ?? null;
}

/**
 * The page a request asked for, or `null` when it asked for page one — which
 * includes every malformed value, because `?page=abc` is not a page and the
 * listing already reads it as one.
 */
export function requestedListingPage(search: URLSearchParams): number | null {
  const raw = search.get("page");
  if (!raw || !/^\d+$/u.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 1) return null;
  return parsed;
}


/**
 * The robots rule a paginated view carries, or `null` for page one.
 *
 * A self-referencing canonical is what Google asks for on page two of a
 * sequence, and this architecture cannot deliver one. The canonical is built
 * in `generateMetadata`, these listings are partially prerendered, and making
 * their metadata depend on `searchParams` took the canonical out of the
 * streamed shell altogether — measured against a production build on
 * 2026-09-11, `/bg/journals?page=2` came back with no `<link rel=canonical>`
 * anywhere in the response. That is worse than the defect it was meant to fix.
 *
 * `noindex, follow` closes the same hole from the other side and is
 * deliverable: the proxy sets it as a header before anything streams. Page two
 * is not indexed, so it cannot be a duplicate of page one; `follow` keeps
 * every entry it lists reachable. The bound in
 * `@/server/public-listing-bounds` answers 404 past the end, so this only ever
 * applies to pages that exist.
 *
 * The self-canonical becomes possible the day pagination moves into the path
 * (`/journals/page/2`), where `generateMetadata` reads it from `params` and
 * the shell can hold it.
 */
export function paginatedListingRobotsTag(
  pathname: string,
  search: URLSearchParams,
): string | null {
  const path = stripLocalePrefix(pathname).path.replace(/\/+$/u, "") || "/";
  const filters = FILTERED_LISTINGS[path] ?? [];
  if (filters.some((filter) => search.get(filter))) return "noindex, follow";
  if (paginatedListingPageSize(pathname) === null) return null;
  return requestedListingPage(search) === null ? null : "noindex, follow";
}
