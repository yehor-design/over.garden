import { PublicJournalDirectory } from "@/components/public/public-journal-directory";
import { getPublicJournalDirectoryCopy } from "@/lib/public-journal-directory-copy";
import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";
import {
  emptyPublicJournalDirectoryFacets,
  emptyPublicJournalDirectoryPage,
} from "@/app/[locale]/journals/page";

/**
 * The skeleton speaks the page's language, not the reader's interface.
 *
 * A `loading.tsx` is streamed first and the page replaces it, so both end up
 * in the HTML a crawler reads without executing it. When this took the
 * interface locale and the page took the address's, `/journals` came back with
 * two `<h1>`s in two languages — measured on production on 2026-09-12, after
 * the unprefixed routes stopped redirecting by geography (ADR-0029 D10).
 *
 * The unprefixed tree is the default locale, so that is what the skeleton
 * uses. A `loading.tsx` is handed no params, which is why the prefixed tree
 * still reads the interface locale: it is the closest thing available there,
 * and it agrees with the route in every ordinary case.
 */
export default function RootJournalsLoading() {
  const request = {
    query: "",
    kind: "all",
    catalog: null,
    topic: null,
    season: "all",
    region: null,
    sort: "recent",
    page: 1,
  } as const;

  return (
    <PublicJournalDirectory
      locale={DEFAULT_PUBLIC_LOCALE}
      copy={getPublicJournalDirectoryCopy(DEFAULT_PUBLIC_LOCALE)}
      page={emptyPublicJournalDirectoryPage(request)}
      facets={emptyPublicJournalDirectoryFacets()}
      state="loading"
    />
  );
}
