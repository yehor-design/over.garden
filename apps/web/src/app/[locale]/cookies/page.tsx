import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AnalyticsPrivacyControls } from "@/app/google-analytics";
import { MetaMarketingPrivacyControls } from "@/app/meta-marketing";
import { LegalDocumentPage } from "@/components/public/legal-document-page";
import { getLegalDocument } from "@/lib/legal/legal-documents";
import { isPublicLocale, PUBLIC_LOCALES } from "@/lib/public-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import {
  resolveNonCandidatePublicSurfaceDiscovery,
  resolveUnresolvedPublicSurfaceDiscovery,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

interface LocalizedCookiesRouteProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocalizedCookiesRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const validLocale = isPublicLocale(localeParam);
  const locale = validLocale ? localeParam : "uk";
  const document = getLegalDocument(locale, "cookies");
  return buildPublicSurfaceMetadata({
    discovery: validLocale
      ? resolveNonCandidatePublicSurfaceDiscovery("cookies")
      : resolveUnresolvedPublicSurfaceDiscovery("cookies"),
    locale,
    title: document.metadataTitle,
    description: document.metadataDescription,
    visibleFacts: { type: "WebPage", name: document.metadataTitle },
  }).metadata;
}

/**
 * The cookie rules (`OVE-526`), with the choices themselves beneath the text:
 * analytics and marketing, each its own switch, off until switched on.
 */
export default async function LocalizedCookiesPage({
  params,
}: LocalizedCookiesRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();
  const copy = getTrustSurfaceCopy(localeParam).privacy;
  return (
    <LegalDocumentPage
      locale={localeParam}
      documentKey="cookies"
      extraSections={[
        {
          id: "cookies-controls",
          heading: copy.choicesTitle,
          body: (
            <div className="grid gap-4">
              <AnalyticsPrivacyControls locale={localeParam} />
              <MetaMarketingPrivacyControls locale={localeParam} />
            </div>
          ),
        },
      ]}
    />
  );
}
