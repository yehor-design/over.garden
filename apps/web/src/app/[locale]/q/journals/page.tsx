import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  generateMetadata as generateJournalsMetadata,
  renderPublicJournalsPage,
} from "@/app/[locale]/journals/page";
import { isPublicLocale } from "@/lib/public-localization";

interface FilteredJournalsProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** Query-only internal twin; the proxy keeps the canonical address unchanged. */
export function generateMetadata({
  params,
}: FilteredJournalsProps): Promise<Metadata> {
  return generateJournalsMetadata({ params });
}

export default async function FilteredJournalsRoute({
  params,
  searchParams,
}: FilteredJournalsProps) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  return renderPublicJournalsPage(locale, (await searchParams) ?? {});
}
