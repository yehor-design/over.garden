import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  generateMetadata as generateHomeMetadata,
  renderLocalizedHomePage,
} from "@/app/[locale]/page";
import { isPublicLocale } from "@/lib/public-localization";

interface FilteredHomeRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The home feed with a filter or a cursor in its address (ADR-0032 D5).
 *
 * Nobody navigates here: `/q` is not an address, and the proxy answers 404 to
 * a request that names it. The proxy *rewrites* `/?kind=plant` to this route so
 * that the page at `/` never has to read a query string and stays a static
 * document. The reader's address bar still says `/?kind=plant`.
 */
export function generateMetadata({
  params,
}: FilteredHomeRouteProps): Promise<Metadata> {
  return generateHomeMetadata({ params });
}

export default async function FilteredHomeRoute({
  params,
  searchParams,
}: FilteredHomeRouteProps) {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  return renderLocalizedHomePage(localeParam, (await searchParams) ?? {});
}
