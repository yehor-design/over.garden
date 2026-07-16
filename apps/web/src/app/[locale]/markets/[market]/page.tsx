import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedMarketLandingPage } from "@/components/public/localized-public-pages";
import {
  DEFAULT_PUBLIC_LOCALE,
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
} from "@/lib/public-localization";
import {
  getLocalizedMarketLanding,
  getLocalizedRouteChrome,
  getMarketLandingLocales,
} from "@/server/public-localized-content";
import { listMarketLandings } from "@/server/public-seo-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface LocalizedMarketRouteProps {
  params: Promise<{ locale: string; market: string }>;
}

export function generateStaticParams() {
  return listMarketLandings().flatMap((landing) =>
    getMarketLandingLocales(landing.market)
      .filter((locale) => locale !== DEFAULT_PUBLIC_LOCALE)
      .map((locale) => ({
        locale,
        market: landing.market,
      })),
  );
}

export async function generateMetadata({
  params,
}: LocalizedMarketRouteProps): Promise<Metadata> {
  const { locale: localeParam, market } = await params;

  if (!isPublicLocale(localeParam)) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "OverGarden",
      robots: missingState.robots,
    };
  }

  const landing = getLocalizedMarketLanding(localeParam, market);

  if (!landing) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: `${getLocalizedRouteChrome(localeParam).marketEyebrow} | OverGarden`,
      robots: missingState.robots,
    };
  }

  const indexState = evaluatePublicSurfaceIndexability({
    kind: landing.kind,
  });
  const availableLocales = getMarketLandingLocales(landing.market);

  return {
    title: `${landing.title} | OverGarden`,
    description: landing.description,
    alternates: {
      canonical: localizedPath(localeParam, landing.path),
      languages: buildLanguageAlternates(landing.path, availableLocales),
    },
    robots: indexState.robots,
    openGraph: {
      locale: localeParam,
    },
  };
}

export default async function MarketLandingRoute({
  params,
}: LocalizedMarketRouteProps) {
  const { locale: localeParam, market } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  const landing = getLocalizedMarketLanding(localeParam, market);

  if (!landing) notFound();

  return (
    <LocalizedMarketLandingPage
      locale={localeParam}
      landing={landing}
      chrome={getLocalizedRouteChrome(localeParam)}
      availableLocales={getMarketLandingLocales(landing.market)}
    />
  );
}
