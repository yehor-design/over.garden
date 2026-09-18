import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { buildListingHref } from "@/lib/public-listing-filters";
import {
  normalizePublicJournalDirectoryRequest,
  type PublicJournalDirectoryRequest,
} from "@/server/public-journal-directory-repository";

const ALLOWED_DIRECTORY_PATHS = new Map<string, PublicLocale>([
  ["/journals", "uk"],
  ["/bg/journals", "bg"],
  ["/ru/journals", "ru"],
]);

/**
 * One address for one view of the directory, in the vocabulary of
 * `@/lib/public-listing-filters` — one parameter per facet, named for the
 * facet, and absent when the facet is unset. `OVE-451` builds the organism
 * catalogue's addresses the same way, which is why the rules live there and
 * only the facet list lives here.
 *
 * The two defaults are dropped rather than written: `page=1` is the listing
 * itself, and the default sort depends on whether there is a query at all —
 * a search is ordered by relevance and a browse by recency — so writing it
 * out would make two spellings of the same view.
 */
export function buildPublicJournalDirectoryHref(
  locale: PublicLocale,
  request: PublicJournalDirectoryRequest,
) {
  const defaultSort = request.query ? "relevance" : "recent";

  return buildListingHref(localizedPath(locale, "/journals"), {
    q: request.query,
    kind: request.kind === "all" ? null : request.kind,
    catalog: request.catalog,
    topic: request.topic,
    season: request.season === "all" ? null : request.season,
    region: request.region,
    sort: request.sort === defaultSort ? null : request.sort,
    page: request.page > 1 ? request.page : null,
  });
}

export function normalizePublicJournalDirectoryReturnTo(
  value: string | null | undefined,
  fallbackLocale: PublicLocale,
) {
  const fallback = localizedPath(fallbackLocale, "/journals");
  if (!value || value.length > 1_500 || !value.startsWith("/")) return fallback;

  try {
    const url = new URL(value, "https://over.garden");
    if (url.origin !== "https://over.garden" || url.hash) return fallback;
    const locale = ALLOWED_DIRECTORY_PATHS.get(url.pathname);
    if (!locale) return fallback;

    const request = normalizePublicJournalDirectoryRequest({
      q: url.searchParams.get("q") ?? undefined,
      kind: url.searchParams.get("kind") ?? undefined,
      catalog: url.searchParams.get("catalog") ?? undefined,
      topic: url.searchParams.get("topic") ?? undefined,
      season: url.searchParams.get("season") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
    });
    return buildPublicJournalDirectoryHref(locale, request);
  } catch {
    return fallback;
  }
}
