import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  eppoArchiveDetailMetadata,
  loadEppoArchiveDetail,
  renderEppoArchiveDetail,
} from "@/app/eppo-archive-pages";
import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

interface EppoDetailPageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({
  params,
}: EppoDetailPageProps): Promise<Metadata> {
  const { code } = await params;
  return eppoArchiveDetailMetadata(DEFAULT_PUBLIC_LOCALE, code);
}

export default async function EppoDetailPage({ params }: EppoDetailPageProps) {
  const { code } = await params;
  const record = await loadEppoArchiveDetail(DEFAULT_PUBLIC_LOCALE, code);
  if (!record) return notFound();
  return renderEppoArchiveDetail(DEFAULT_PUBLIC_LOCALE, record);
}
