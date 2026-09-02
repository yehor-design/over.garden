import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  loadPublicStableRegistryDetail,
  renderStableRegistryDetail,
  stableRegistryDetailMetadata,
} from "@/app/stable-registry-public-pages";
import { isPublicLocale } from "@/lib/public-localization";

interface CatalogDetailPageProps {
  params: Promise<{ locale: string; stableTaxon: string }>;
}

export async function generateMetadata({
  params,
}: CatalogDetailPageProps): Promise<Metadata> {
  const { locale, stableTaxon } = await params;
  if (!isPublicLocale(locale)) return { title: "OverGarden" };
  return stableRegistryDetailMetadata(locale, "catalog", stableTaxon);
}

export default async function LocalizedCatalogDetailPage({
  params,
}: CatalogDetailPageProps) {
  const { locale, stableTaxon } = await params;
  if (!isPublicLocale(locale)) notFound();
  const record = await loadPublicStableRegistryDetail(
    locale,
    "catalog",
    stableTaxon,
  );
  if (!record) return notFound();
  return renderStableRegistryDetail(locale, "catalog", record);
}
