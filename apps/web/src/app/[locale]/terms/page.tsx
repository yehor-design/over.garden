import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalDocumentPage } from "@/components/public/legal-document-page";
import { getLegalDocument } from "@/lib/legal/legal-documents";
import { isPublicLocale, PUBLIC_LOCALES } from "@/lib/public-localization";
import {
  resolveNonCandidatePublicSurfaceDiscovery,
  resolveUnresolvedPublicSurfaceDiscovery,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

interface LocalizedTermsRouteProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocalizedTermsRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const validLocale = isPublicLocale(localeParam);
  const locale = validLocale ? localeParam : "uk";
  const document = getLegalDocument(locale, "terms");
  return buildPublicSurfaceMetadata({
    discovery: validLocale
      ? resolveNonCandidatePublicSurfaceDiscovery("terms")
      : resolveUnresolvedPublicSurfaceDiscovery("terms"),
    locale,
    title: document.metadataTitle,
    description: document.metadataDescription,
    visibleFacts: { type: "WebPage", name: document.metadataTitle },
  }).metadata;
}

/** Overgarden's terms of use (`OVE-526`), accepted once with the other two. */
export default async function LocalizedTermsPage({
  params,
}: LocalizedTermsRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();
  return <LegalDocumentPage locale={localeParam} documentKey="terms" />;
}
