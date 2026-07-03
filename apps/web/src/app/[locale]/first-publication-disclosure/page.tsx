import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicLocalizedHeader } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  PUBLIC_LOCALES,
} from "@/lib/public-localization";
import {
  FIRST_PUBLICATION_DISCLOSURE_LINES,
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  PILOT_LEGAL_COPY_STATUS_LABEL,
} from "@/lib/privacy/disclosures";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

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
  const noindexState = evaluatePublicSurfaceIndexability({
    kind: isPublicLocale(localeParam) ? "profile" : "missing",
  });

  return {
    title: "Pilot first-publication disclosure | OverGarden",
    description:
      "Closed-pilot OverGarden disclosure shown before a first public journal publication.",
    alternates: isPublicLocale(localeParam)
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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8">
      <PublicLocalizedHeader
        locale={localeParam}
        basePath="/first-publication-disclosure"
        availableLocales={PUBLIC_LOCALES}
      />
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Pilot first-publication disclosure
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Version {FIRST_PUBLICATION_DISCLOSURE_VERSION}.{" "}
          {PILOT_LEGAL_COPY_STATUS_LABEL}.
        </p>
      </header>
      <div className="grid gap-4 text-sm leading-6 text-foreground">
        <p>
          This is the current closed-pilot wording logged when a gardener
          accepts the first publication disclosure. Public launch still needs
          final legal policy and process approval.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          {FIRST_PUBLICATION_DISCLOSURE_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          Material wording changes must create a new disclosure version before
          publication logging is considered valid.
        </p>
      </div>
    </main>
  );
}
