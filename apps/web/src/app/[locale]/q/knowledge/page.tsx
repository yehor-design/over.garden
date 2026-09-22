import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  generateMetadata as generateKnowledgeMetadata,
  renderPublicKnowledgePage,
} from "@/app/[locale]/knowledge/page";
import { isPublicLocale } from "@/lib/public-localization";

interface FilteredKnowledgeProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** Query-only internal twin; the proxy keeps the canonical address unchanged. */
export function generateMetadata({
  params,
}: FilteredKnowledgeProps): Promise<Metadata> {
  return generateKnowledgeMetadata({ params });
}

export default async function FilteredKnowledgeRoute({
  params,
  searchParams,
}: FilteredKnowledgeProps) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  return renderPublicKnowledgePage(locale, (await searchParams) ?? {});
}
