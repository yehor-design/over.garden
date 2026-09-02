import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  loadPublicStableRegistryDetail,
  renderStableRegistryDetail,
  stableRegistryDetailMetadata,
} from "@/app/stable-registry-public-pages";
import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

interface CatalogDetailPageProps {
  params: Promise<{ stableTaxon: string }>;
}

export async function generateMetadata({
  params,
}: CatalogDetailPageProps): Promise<Metadata> {
  const { stableTaxon } = await params;
  return stableRegistryDetailMetadata(
    DEFAULT_PUBLIC_LOCALE,
    "catalog",
    stableTaxon,
  );
}

export default async function CatalogDetailPage({
  params,
}: CatalogDetailPageProps) {
  const { stableTaxon } = await params;
  const record = await loadPublicStableRegistryDetail(
    DEFAULT_PUBLIC_LOCALE,
    "catalog",
    stableTaxon,
  );
  if (!record) return notFound();
  return renderStableRegistryDetail(DEFAULT_PUBLIC_LOCALE, "catalog", record);
}
