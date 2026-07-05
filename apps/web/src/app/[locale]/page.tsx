import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedHomePage } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import { getLocalizedHomeContent } from "@/server/public-localized-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface LocalizedHomeRouteProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocalizedHomeRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "OverGarden",
      robots: missingState.robots,
    };
  }

  const content = getLocalizedHomeContent(localeParam);
  const indexState = evaluatePublicSurfaceIndexability({
    kind: "marketing_landing",
  });

  return {
    title: content.title,
    description: content.description,
    alternates: {
      canonical: localizedPath(localeParam, "/"),
      languages: buildLanguageAlternates("/"),
    },
    robots: indexState.robots,
    openGraph: {
      locale: localeParam,
    },
  };
}

export function renderLocalizedHomePage(locale: PublicLocale) {
  return (
    <LocalizedHomePage
      locale={locale}
      content={getLocalizedHomeContent(locale)}
      availableLocales={getLanguageSwitcherLocales(locale)}
    />
  );
}

export default async function HomeRoute({ params }: LocalizedHomeRouteProps) {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  return renderLocalizedHomePage(localeParam);
}
