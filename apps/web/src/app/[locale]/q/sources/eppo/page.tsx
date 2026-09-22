import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  eppoArchiveExplorerMetadata,
  renderEppoArchiveExplorer,
} from "@/app/eppo-archive-pages";
import { isPublicLocale } from "@/lib/public-localization";

interface FilteredEppoProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** Query-only internal twin; the proxy keeps the canonical address unchanged. */
export async function generateMetadata({
  params,
}: FilteredEppoProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isPublicLocale(locale)) return { title: "OverGarden" };
  return eppoArchiveExplorerMetadata(locale);
}

export default async function FilteredEppoRoute({
  params,
  searchParams,
}: FilteredEppoProps) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  return renderEppoArchiveExplorer(locale, (await searchParams) ?? {});
}
