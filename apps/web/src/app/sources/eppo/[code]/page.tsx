import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  loadPublicStableRegistryDetail,
  renderStableRegistryDetail,
  stableRegistryDetailMetadata,
} from "@/app/stable-registry-public-pages";
import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

// Source evidence is read from a terminal capture at request time and must
// never be frozen into the build output.
export const dynamic = "force-dynamic";

interface EppoDetailPageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({
  params,
}: EppoDetailPageProps): Promise<Metadata> {
  const { code } = await params;
  return stableRegistryDetailMetadata(DEFAULT_PUBLIC_LOCALE, "eppo", code);
}

export default async function EppoDetailPage({ params }: EppoDetailPageProps) {
  const { code } = await params;
  const record = await loadPublicStableRegistryDetail(
    DEFAULT_PUBLIC_LOCALE,
    "eppo",
    code,
  );
  if (!record) return notFound();
  return renderStableRegistryDetail(DEFAULT_PUBLIC_LOCALE, "eppo", record);
}
