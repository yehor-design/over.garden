import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";
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
 * It renders. It does **not** redirect a reader whose interface is Bulgarian
 * or Russian to their own prefix, for two reasons that are the same reason:
 *
 *  * D10 — a canonical URL answers `200` to everyone, and OVE-422 took the
 *    geography redirects out of every other public page;
 *  * a `redirect()` here cannot work anyway. The shell has already streamed by
 *    the time this runs, so the status is `200` and the location header has
 *    sailed — the reader gets the chrome and an empty page. Measured on
 *    production on 2026-09-12: `/species` came back 61 267 bytes with no `h1`
 *    at all for a request geolocated to Bulgaria, while `/bg/species` rendered
 *    in full.
 *
 * The language control in the shell is how a reader reaches their own prefix,
 * and `hreflang` is how a crawler does.
 */
export default async function RootSpeciesBrowseRoute({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
} = {}) {
  const query = (await searchParams) ?? ({} as SearchParams);
  return renderPublicSpeciesBrowsePage(DEFAULT_PUBLIC_LOCALE, query);
}
