import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicArticle } from "@/components/public/public-article";
import { isPublicLocale, PUBLIC_LOCALES } from "@/lib/public-localization";
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
    // Public-first processing and deletion notice, versioned with the API.
    // What publishing means comes first, under its own heading; which
    // version this is and how versions work close the page (`OVE-505`). The
    // lines themselves are the versioned text a gardener accepts, and are
    // not reworded here.
    <PublicArticle
      locale={localeParam}
      dataset={{ "data-trust-surface": "first-publication" }}
      title={copy.title}
      description={copy.lead}
      contentsLabel={copy.title}
      sections={[
        {
          id: "first-publication-body",
          heading: copy.linesTitle,
          body: (
            <ul className="grid list-disc gap-2 pl-5 text-text-secondary">
              {copy.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ),
        },
        {
          id: "first-publication-about",
          heading: copy.aboutTitle,
          body: (
            <div className="grid gap-2 text-text-secondary">
              {/* One string: a space between two pieces of JSX text is
                  written after React's `<!-- -->`, and Chromium drops it
                  from what a screen reader reads (`OVE-478`). */}
              <p>
                {`${copy.version} ${FIRST_PUBLICATION_DISCLOSURE_VERSION}. ${copy.statusLabel}.`}
              </p>
              <p>{copy.body}</p>
            </div>
          ),
        },
      ]}
    />
  );
}
