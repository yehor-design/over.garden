import { Suspense } from "react";

import { PublicCatalogBrowse } from "@/components/public/public-catalog-browse";
import { EMPTY_PUBLIC_CATALOG_BROWSE_REQUEST } from "@/lib/public-catalog-browse";
import { getPublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
} from "@/lib/public-localization";

/**
 * The catalogue's own skeleton, so a hard load shows the page's shape rather
 * than the shell's (DESIGN.md §5.4). The facets and the alphabet render for
 * real — they are links and a form, and neither needs the listing to exist.
 *
 * It is a layout rather than a `loading.tsx` because it speaks a language, and
 * a fallback is part of a static document's prerendered shell (ADR-0032 D6):
 * it may not read the request. A layout is handed the route's `params`.
 */
export default async function LocalizedCatalogLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = isPublicLocale(localeParam)
    ? localeParam
    : DEFAULT_PUBLIC_LOCALE;

  return (
    <Suspense
      fallback={
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
      }
    >
      {children}
    </Suspense>
  );
}
