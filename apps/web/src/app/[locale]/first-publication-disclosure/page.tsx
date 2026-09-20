import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicArticle } from "@/components/public/public-article";
import {
  isPublicLocale,
  PUBLIC_LOCALES,
} from "@/lib/public-localization";
import { FIRST_PUBLICATION_DISCLOSURE_VERSION } from "@/lib/privacy/disclosures";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import {
  resolveNonCandidatePublicSurfaceDiscovery,
  resolveUnresolvedPublicSurfaceDiscovery,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

interface LocalizedFirstPublicationDisclosureRouteProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocalizedFirstPublicationDisclosureRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const validLocale = isPublicLocale(localeParam);
  const discovery = validLocale
    ? resolveNonCandidatePublicSurfaceDiscovery("first_publication_disclosure")
    : resolveUnresolvedPublicSurfaceDiscovery("first_publication_disclosure");
  const copy = getTrustSurfaceCopy(
    validLocale ? localeParam : "uk",
  ).firstPublication;

  return buildPublicSurfaceMetadata({
    discovery,
    locale: validLocale ? localeParam : "uk",
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    visibleFacts: { type: "WebPage", name: copy.metadataTitle },
  }).metadata;
}

export default async function LocalizedFirstPublicationDisclosurePage({
  params,
}: LocalizedFirstPublicationDisclosureRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  const copy = getTrustSurfaceCopy(localeParam).firstPublication;

  return (
    // The wording is a legal disclosure and is unchanged (`OVE-453`
    // criterion 5). The shape is the product's one article shape.
    <PublicArticle
      locale={localeParam}
      dataset={{ "data-trust-surface": "first-publication" }}
      title={copy.title}
      description={`${copy.version} ${FIRST_PUBLICATION_DISCLOSURE_VERSION}. ${copy.statusLabel}.`}
      contentsLabel={copy.title}
      sections={[
        {
          id: "first-publication-body",
          heading: copy.title,
          body: (
            <div className="grid gap-4">
              <p>{copy.body}</p>
              <ul className="grid list-disc gap-2 pl-5 text-text-secondary">
                {copy.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ),
        },
      ]}
    />
  );
}
