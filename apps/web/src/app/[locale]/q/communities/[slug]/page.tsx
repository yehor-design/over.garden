import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  generateMetadata as generateCommunityMetadata,
  renderCommunityForRequest,
} from "@/app/[locale]/communities/[slug]/page";
import { isPublicLocale } from "@/lib/public-localization";

interface FilteredCommunityProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The community with a query of its own (`q`, `kind`, `cursor`): the internal
 * twin (ADR-0032 D5). The proxy rewrites here and the reader's address does
 * not change; the metadata is the community's own, so the canonical stays the
 * unfiltered address.
 */
export function generateMetadata({
  params,
}: FilteredCommunityProps): Promise<Metadata> {
  return generateCommunityMetadata({ params });
}

export default async function FilteredCommunityRoute({
  params,
  searchParams,
}: FilteredCommunityProps) {
  const { locale, slug } = await params;
  const normalized = slug.trim().toLowerCase();
  if (!isPublicLocale(locale) || !/^[a-z0-9][a-z0-9-]{1,63}$/u.test(normalized))
    notFound();
  return renderCommunityForRequest(
    locale,
    normalized,
    (await searchParams) ?? {},
  );
}
