import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";
import {
  generateMetadata as generateLocalizedCatalogMetadata,
  renderPublicCatalogPage,
} from "@/app/[locale]/catalog/page";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata() {
  return generateLocalizedCatalogMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

/**
 * `/catalog` without a prefix, which is the Ukrainian address (ADR-0029 D10).
 *
 * It renders. It does **not** redirect a reader whose interface is Bulgarian
 * or Russian to their own prefix: a canonical URL answers `200` to everyone,
 * and a `redirect()` here cannot work anyway — the shell has already streamed
 * by the time this runs, so the status is `200` and the location header has
 * sailed. The language control in the shell is how a reader reaches their own
 * prefix, and `hreflang` is how a crawler does.
 */
export default async function RootCatalogRoute({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
} = {}) {
  const query = (await searchParams) ?? ({} as SearchParams);
  return renderPublicCatalogPage(DEFAULT_PUBLIC_LOCALE, query);
}
