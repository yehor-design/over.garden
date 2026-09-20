import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AnalyticsPrivacyControls } from "@/app/google-analytics";
import { MetaMarketingPrivacyControls } from "@/app/meta-marketing";
import { PublicArticle } from "@/components/public/public-article";
import { Link } from "@/components/ui/link";
import {
  isPublicLocale,
  localizedPath,
  PUBLIC_LOCALES,
} from "@/lib/public-localization";
import {
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  SUPPORT_EMAIL,
} from "@/lib/privacy/disclosures";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import {
  resolveNonCandidatePublicSurfaceDiscovery,
  resolveUnresolvedPublicSurfaceDiscovery,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

interface LocalizedPrivacyRouteProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocalizedPrivacyRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const validLocale = isPublicLocale(localeParam);
  const discovery = validLocale
    ? resolveNonCandidatePublicSurfaceDiscovery("privacy")
    : resolveUnresolvedPublicSurfaceDiscovery("privacy");
  const copy = getTrustSurfaceCopy(validLocale ? localeParam : "uk").privacy;

  return buildPublicSurfaceMetadata({
    discovery,
    locale: validLocale ? localeParam : "uk",
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    visibleFacts: { type: "WebPage", name: copy.metadataTitle },
  }).metadata;
}

export default async function LocalizedPrivacyNoticePage({
  params,
}: LocalizedPrivacyRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  const copy = getTrustSurfaceCopy(localeParam).privacy;

  return (
    // The legal wording is unchanged, and changing it would be a legal
    // decision rather than a design one (`OVE-453` criterion 5). What changes
    // is that it is now the product's one article shape: real headings with
    // real ids, a contents list that is the rail above `xl` and a list at the
    // foot below it, and the reading column's measure instead of a wall.
    <PublicArticle
      locale={localeParam}
      dataset={{ "data-trust-surface": "privacy" }}
      title={copy.title}
      description={copy.intro}
      contentsLabel={copy.title}
      sections={[
        {
          id: "privacy-status",
          heading: copy.statusPrefix,
          body: <strong>{copy.statusLabel}</strong>,
        },
        {
          id: "privacy-controls",
          heading: copy.controlsTitle,
          body: <PolicyList lines={copy.controls} />,
        },
        {
          id: "privacy-retention",
          heading: copy.retentionTitle,
          body: <PolicyList lines={copy.retention} />,
        },
        {
          id: "privacy-boundaries",
          heading: copy.boundariesTitle,
          body: <PolicyList lines={copy.boundaries} />,
        },
        {
          id: "privacy-choices",
          heading: copy.contactTitle,
          body: (
            <div className="grid gap-4">
              <AnalyticsPrivacyControls locale={localeParam} />
              <MetaMarketingPrivacyControls locale={localeParam} />
              <p className="text-text-secondary">
                {copy.contactBeforeEmail}
                <Link href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</Link>
                {copy.contactAfterEmail}
              </p>
            </div>
          ),
        },
        {
          id: "privacy-related",
          heading: copy.relatedTitle,
          body: (
            <ul className="flex list-none flex-wrap gap-4">
              <li>
                <Link href="/erasure">{copy.erasureLink}</Link>
              </li>
              <li>
                <Link href="/support">{copy.supportLink}</Link>
              </li>
              <li>
                <Link
                  href={localizedPath(
                    localeParam,
                    "/first-publication-disclosure",
                  )}
                >
                  {copy.firstPublicationLink}{" "}
                  {FIRST_PUBLICATION_DISCLOSURE_VERSION}
                </Link>
              </li>
            </ul>
          ),
        },
      ]}
    />
  );
}

function PolicyList({ lines }: { lines: readonly string[] }) {
  return (
    <ul className="grid list-disc gap-2 pl-5 text-text-secondary">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
