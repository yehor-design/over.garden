import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AnalyticsPrivacyControls } from "@/app/google-analytics";
import { MetaMarketingPrivacyControls } from "@/app/meta-marketing";
import { PublicLocalizedHeader } from "@/components/public/localized-public-pages";
import {
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
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
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
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
    <main
      lang={localeParam}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8"
    >
      <PublicLocalizedHeader
        locale={localeParam}
        basePath="/privacy"
        availableLocales={getLanguageSwitcherLocales(localeParam)}
      />
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.intro}
        </p>
      </header>
      <div className="grid gap-4 text-sm leading-6 text-foreground">
        <p>
          {copy.statusPrefix} <strong>{copy.statusLabel}</strong>.
        </p>
        <PolicyList title={copy.controlsTitle} lines={copy.controls} />
        <PolicyList title={copy.retentionTitle} lines={copy.retention} />
        <PolicyList title={copy.boundariesTitle} lines={copy.boundaries} />
        <AnalyticsPrivacyControls locale={localeParam} />
        <MetaMarketingPrivacyControls locale={localeParam} />
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            {copy.contactTitle}
          </h2>
          <p className="text-muted-foreground">
            {copy.contactBeforeEmail}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            {copy.contactAfterEmail}
          </p>
        </section>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            {copy.relatedTitle}
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/erasure"
              className="text-primary underline-offset-4 hover:underline"
            >
              {copy.erasureLink}
            </Link>
            <Link
              href="/support"
              className="text-primary underline-offset-4 hover:underline"
            >
              {copy.supportLink}
            </Link>
            <Link
              href={localizedPath(localeParam, "/first-publication-disclosure")}
              className="text-primary underline-offset-4 hover:underline"
            >
              {copy.firstPublicationLink} {FIRST_PUBLICATION_DISCLOSURE_VERSION}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function PolicyList({
  title,
  lines,
}: {
  title: string;
  lines: readonly string[];
}) {
  return (
    <section className="grid gap-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
