import { redirect } from "next/navigation";

import {
  buildPublicCatalogBrowseHref,
  normalizePublicCatalogBrowseRequest,
} from "@/lib/public-catalog-browse";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  generateMetadata as generateLocalizedSpeciesBrowseMetadata,
  renderPublicSpeciesBrowsePage,
} from "@/app/[locale]/species/page";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
} = {}) {
  return generateLocalizedSpeciesBrowseMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
    searchParams,
  });
}

/**
 * `/species` without a prefix, which is the Ukrainian address (ADR-0029 D10).
 *
 * The same shape the knowledge hub uses: a reader whose interface is Bulgarian
 * or Russian is sent to their own prefix, so the page they land on is the one
 * whose canonical they can see.
 */
export default async function RootSpeciesBrowseRoute({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
} = {}) {
  const [locale, query] = await Promise.all([
    getRequestInterfaceLocale(),
    searchParams ?? Promise.resolve({} as SearchParams),
  ]);
  const request = normalizePublicCatalogBrowseRequest(query);

  if (locale !== DEFAULT_PUBLIC_LOCALE) {
    redirect(buildPublicCatalogBrowseHref(locale as PublicLocale, request));
  }

  return renderPublicSpeciesBrowsePage(DEFAULT_PUBLIC_LOCALE, query);
}
