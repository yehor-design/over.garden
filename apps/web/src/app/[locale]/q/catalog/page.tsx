import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  generateMetadata as generateCatalogMetadata,
  renderPublicCatalogPage,
} from "@/app/[locale]/catalog/page";
import { isPublicLocale } from "@/lib/public-localization";

interface FilteredCatalogProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** Query-only internal twin; the proxy keeps the canonical address unchanged. */
export function generateMetadata({
  params,
}: FilteredCatalogProps): Promise<Metadata> {
  return generateCatalogMetadata({ params });
}

export default async function FilteredCatalogRoute({
  params,
  searchParams,
}: FilteredCatalogProps) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  return renderPublicCatalogPage(locale, (await searchParams) ?? {});
}
