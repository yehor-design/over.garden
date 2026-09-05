import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  eppoArchiveExplorerMetadata,
  renderEppoArchiveExplorer,
} from "@/app/eppo-archive-pages";
import {
  isPublicLocale,
  PREFIXED_PUBLIC_LOCALES,
} from "@/lib/public-localization";

interface EppoPageProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: EppoPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isPublicLocale(locale)) return { title: "OverGarden" };
  return eppoArchiveExplorerMetadata(locale);
}

export default async function LocalizedEppoPage({
  params,
  searchParams,
}: EppoPageProps) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  return renderEppoArchiveExplorer(locale, (await searchParams) ?? {});
}
