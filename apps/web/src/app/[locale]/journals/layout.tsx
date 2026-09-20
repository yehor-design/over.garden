import { Suspense } from "react";

import { PublicJournalDirectory } from "@/components/public/public-journal-directory";
import { getPublicJournalDirectoryCopy } from "@/lib/public-journal-directory-copy";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
} from "@/lib/public-localization";
import {
  emptyPublicJournalDirectoryFacets,
  emptyPublicJournalDirectoryPage,
} from "./page";

/**
 * The directory's own loading shape, in the route's language.
 *
 * This was a `loading.tsx` that read the reader's language from the request —
 * which a fallback may not do once the document around it is static
 * (ADR-0032 D6): the fallback is part of the prerendered shell. A `loading`
 * file is handed no `params`; a layout is, so the boundary lives here and the
 * language comes from the route, where it has been all along.
 */
export default async function LocalizedJournalsLayout({
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
    <Suspense
      fallback={
        <PublicJournalDirectory
          locale={locale}
          copy={getPublicJournalDirectoryCopy(locale)}
          page={emptyPublicJournalDirectoryPage(request)}
          facets={emptyPublicJournalDirectoryFacets()}
          state="loading"
        />
      }
    >
      {children}
    </Suspense>
  );
}
