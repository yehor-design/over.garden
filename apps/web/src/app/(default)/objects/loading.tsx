import { PublicObjectCatalog } from "@/components/public/public-object-catalog";
import { getPublicObjectCatalogCopy } from "@/lib/public-object-catalog-copy";
import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

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
export default function ObjectsLoading() {
  const request = { kind: "all", identity: "all", query: "", page: 1 } as const;

  return (
    <PublicObjectCatalog
      locale={DEFAULT_PUBLIC_LOCALE}
      copy={getPublicObjectCatalogCopy(DEFAULT_PUBLIC_LOCALE)}
      page={{
        request,
        cards: [],
        totalCount: 0,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      }}
      state="loading"
    />
  );
}
