import {
  EMPTY_PUBLIC_CATALOG_BROWSE_REQUEST,
} from "@/lib/public-catalog-browse";
import { PublicCatalogBrowse } from "@/components/public/public-catalog-browse";
import { getPublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

/**
 * The catalogue's own skeleton, so a hard load shows the page's shape rather
 * than the shell's (DESIGN.md §5.4). The facets and the alphabet render for
 * real — they are links and a form, and neither needs the listing to exist.
 */
export default async function LocalizedCatalogLoading() {
  const locale = await getRequestInterfaceLocale();

  return (
    <PublicCatalogBrowse
      locale={locale}
      copy={getPublicCatalogBrowseCopy(locale)}
      request={EMPTY_PUBLIC_CATALOG_BROWSE_REQUEST}
      page={{ cards: [], total: 0, pageCount: 1 }}
      facets={{
        kingdoms: {},
        ranks: {},
        registers: { ua: 0, eu: 0 },
        grown: 0,
        initials: {},
        total: 0,
      }}
      kingdomTotals={{}}
      state="loading"
    />
  );
}
