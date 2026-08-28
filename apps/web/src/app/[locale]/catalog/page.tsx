import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  renderStableRegistryExplorer,
  stableRegistryExplorerMetadata,
} from "@/app/stable-registry-public-pages";
import {
  isPublicLocale,
  PREFIXED_PUBLIC_LOCALES,
} from "@/lib/public-localization";

interface CatalogPageProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: CatalogPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isPublicLocale(locale)) return { title: "OverGarden" };
  return stableRegistryExplorerMetadata(locale, "catalog");
}

export default async function LocalizedCatalogPage({
  params,
  searchParams,
}: CatalogPageProps) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  return renderStableRegistryExplorer(
    locale,
    "catalog",
    (await searchParams) ?? {},
  );
}
