import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  loadPublicStableRegistryDetail,
  renderStableRegistryDetail,
  stableRegistryDetailMetadata,
} from "@/app/stable-registry-public-pages";
import { isPublicLocale } from "@/lib/public-localization";

interface EppoDetailPageProps {
  params: Promise<{ locale: string; code: string }>;
}

export async function generateMetadata({
  params,
}: EppoDetailPageProps): Promise<Metadata> {
  const { locale, code } = await params;
  if (!isPublicLocale(locale)) return { title: "OverGarden" };
  return stableRegistryDetailMetadata(locale, "eppo", code);
}

export default async function LocalizedEppoDetailPage({
  params,
}: EppoDetailPageProps) {
  const { locale, code } = await params;
  if (!isPublicLocale(locale)) notFound();
  const record = await loadPublicStableRegistryDetail(locale, "eppo", code);
  if (!record) return notFound();
  return renderStableRegistryDetail(locale, "eppo", record);
}
