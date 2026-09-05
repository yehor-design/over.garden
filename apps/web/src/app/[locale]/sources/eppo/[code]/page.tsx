import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  eppoArchiveDetailMetadata,
  loadEppoArchiveDetail,
  renderEppoArchiveDetail,
} from "@/app/eppo-archive-pages";
import { isPublicLocale } from "@/lib/public-localization";

interface EppoDetailPageProps {
  params: Promise<{ locale: string; code: string }>;
}

export async function generateMetadata({
  params,
}: EppoDetailPageProps): Promise<Metadata> {
  const { locale, code } = await params;
  if (!isPublicLocale(locale)) return { title: "OverGarden" };
  return eppoArchiveDetailMetadata(locale, code);
}

export default async function LocalizedEppoDetailPage({
  params,
}: EppoDetailPageProps) {
  const { locale, code } = await params;
  if (!isPublicLocale(locale)) notFound();
  const record = await loadEppoArchiveDetail(locale, code);
  if (!record) return notFound();
  return renderEppoArchiveDetail(locale, record);
}
