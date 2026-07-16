import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicLocalizedHeader } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
} from "@/lib/public-localization";
import { FIRST_PUBLICATION_DISCLOSURE_VERSION } from "@/lib/privacy/disclosures";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface LocalizedFirstPublicationDisclosureRouteProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocalizedFirstPublicationDisclosureRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const validLocale = isPublicLocale(localeParam);
  const noindexState = evaluatePublicSurfaceIndexability({
    kind: validLocale ? "profile" : "missing",
  });
  const copy = getTrustSurfaceCopy(
    validLocale ? localeParam : "uk",
  ).firstPublication;

  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    alternates: validLocale
      ? {
          canonical: localizedPath(
            localeParam,
            "/first-publication-disclosure",
          ),
          languages: buildLanguageAlternates("/first-publication-disclosure"),
        }
      : undefined,
    robots: noindexState.robots,
  };
}

export default async function LocalizedFirstPublicationDisclosurePage({
  params,
}: LocalizedFirstPublicationDisclosureRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  const copy = getTrustSurfaceCopy(localeParam).firstPublication;

  return (
    <main
      lang={localeParam}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8"
    >
      <PublicLocalizedHeader
        locale={localeParam}
        basePath="/first-publication-disclosure"
        availableLocales={getLanguageSwitcherLocales(localeParam)}
      />
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {copy.version} {FIRST_PUBLICATION_DISCLOSURE_VERSION}.{" "}
          {copy.statusLabel}.
        </p>
      </header>
      <div className="grid gap-4 text-sm leading-6 text-foreground">
        <p>{copy.body}</p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          {copy.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
