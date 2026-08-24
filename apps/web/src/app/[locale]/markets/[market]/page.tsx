import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedMarketLandingPage } from "@/components/public/localized-public-pages";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  getLocalizedMarketLanding,
  getLocalizedRouteChrome,
  getMarketLandingLocales,
} from "@/server/public-localized-content";
import {
  authoredContentEntityIds,
  listMarketLandings,
  marketLandingVisibleText,
  resolveAuthoredPublicSurfaceDiscovery,
  type MarketLandingContent,
} from "@/server/public-seo-content";
import { AUTHORED_PUBLIC_SURFACE_LASTMOD } from "@/server/public-surface-indexing-policy";
import { resolveUnresolvedPublicSurfaceDiscovery } from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

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
    const missingState =
      resolveUnresolvedPublicSurfaceDiscovery("localized_market").decision;

    return {
      title: "OverGarden",
      robots: missingState.robots,
    };
  }

  const landing = getLocalizedMarketLanding(localeParam, market);

  if (!landing) {
    const missingState =
      resolveUnresolvedPublicSurfaceDiscovery("localized_market").decision;

    return {
      title: `${getLocalizedRouteChrome(localeParam).marketEyebrow} | OverGarden`,
      robots: missingState.robots,
    };
  }

  return buildMarketSurface(localeParam, landing).metadata;
}

export default async function MarketLandingRoute({
  params,
}: LocalizedMarketRouteProps) {
  const { locale: localeParam, market } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  const landing = getLocalizedMarketLanding(localeParam, market);

  if (!landing) notFound();

  const surface = buildMarketSurface(localeParam, landing);

  return (
    <LocalizedMarketLandingPage
      locale={localeParam}
      landing={landing}
      chrome={getLocalizedRouteChrome(localeParam)}
      availableLocales={getMarketLandingLocales(landing.market)}
      jsonLd={surface.jsonLd}
    />
  );
}

function buildMarketSurface(
  locale: PublicLocale,
  landing: MarketLandingContent,
) {
  const discovery = resolveAuthoredPublicSurfaceDiscovery({
    consumerId: "localized_market",
    canonicalPath: localizedPath(locale, landing.path),
    equivalentLocales: getMarketLandingLocales(landing.market),
    visibleText: marketLandingVisibleText(landing),
    distinctPublicEntityIds: authoredContentEntityIds(
      landing.path,
      landing.relatedLinks.map((link) => link.href),
    ),
    meaningfulContentAt: AUTHORED_PUBLIC_SURFACE_LASTMOD,
  });
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: `${landing.title} | OverGarden`,
    description: landing.description,
    visibleFacts: {
      type: "Article",
      name: landing.title,
      description: landing.description,
      dateModified: AUTHORED_PUBLIC_SURFACE_LASTMOD,
      trustQualifier: "OverGarden market guidance",
    },
  });
}
