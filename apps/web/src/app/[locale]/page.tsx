import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedHomePage } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  PUBLIC_LOCALES,
} from "@/lib/public-localization";
import { getLocalizedHomeContent } from "@/server/public-localized-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface LocalizedHomeRouteProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
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

export default async function HomeRoute({ params }: LocalizedHomeRouteProps) {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  return (
    <LocalizedHomePage
      locale={localeParam}
      content={getLocalizedHomeContent(localeParam)}
      availableLocales={PUBLIC_LOCALES}
    />
  );
}
