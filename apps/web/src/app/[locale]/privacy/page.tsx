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
  ERASURE_REQUEST_INTAKE_VERSION,
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
    // Public-first processing and deletion notice, versioned with the API.
    // In the order a reader asks (`OVE-505`): what becomes public, how long
    // anything is kept, what they can choose, where to ask — and only then
    // what this text is and which versions it carries. The status line and
    // the form's version tag used to open the page.
    <PublicArticle
      locale={localeParam}
      dataset={{ "data-trust-surface": "privacy" }}
      title={copy.title}
      description={copy.intro}
      contentsLabel={copy.title}
      sections={[
        {
          id: "privacy-public",
          heading: copy.publicTitle,
          body: <PolicyList lines={copy.controls} />,
        },
        {
          id: "privacy-retention",
          heading: copy.retentionTitle,
          body: <PolicyList lines={copy.retention} />,
        },
        {
          // The consent notice links here.
          id: "privacy-choices",
          heading: copy.choicesTitle,
          body: (
            <div className="grid gap-4">
              <AnalyticsPrivacyControls locale={localeParam} />
              <MetaMarketingPrivacyControls locale={localeParam} />
            </div>
          ),
        },
        {
          id: "privacy-contact",
          heading: copy.contactTitle,
          body: (
            <div className="grid gap-4">
              <p className="text-text-secondary">
                {copy.contactBeforeEmail}
                <Link href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</Link>
                {copy.contactAfterEmail}
              </p>
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
                    {copy.firstPublicationLink}
                  </Link>
                </li>
              </ul>
            </div>
          ),
        },
        {
          id: "privacy-about",
          heading: copy.aboutTitle,
          body: (
            <div className="grid gap-3 text-text-secondary">
              <p>{`${copy.statusPrefix} ${copy.statusLabel}`}</p>
              <PolicyList lines={copy.boundaries} />
              <p className="text-caption text-text-muted">
                {copy.versionsLabel
                  .replace(
                    "{firstPublication}",
                    FIRST_PUBLICATION_DISCLOSURE_VERSION,
                  )
                  .replace("{erasure}", ERASURE_REQUEST_INTAKE_VERSION)}
              </p>
            </div>
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
