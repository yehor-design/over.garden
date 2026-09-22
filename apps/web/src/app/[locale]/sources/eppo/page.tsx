import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  eppoArchiveExplorerMetadata,
  renderEppoArchiveExplorer,
} from "@/app/eppo-archive-pages";
import { isPublicLocale, PUBLIC_LOCALES } from "@/lib/public-localization";
import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import { renderStaticPublicPage } from "@/server/static-public-page";

interface EppoPageProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: EppoPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isPublicLocale(locale)) return { title: "OverGarden" };
  return eppoArchiveExplorerMetadata(locale, "static");
}

export default async function LocalizedEppoPage({ params }: EppoPageProps) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  // The archive with nothing asked of it: the static document. A query it
  // reads — `kind`, `q`, `cursor` — renders from the `/q` twin (ADR-0032 D5).
  return renderStaticPublicPage({
    fallback: <RootLoadingSkeleton />,
    render: (phase) => renderEppoArchiveExplorer(locale, {}, phase),
  });
}
