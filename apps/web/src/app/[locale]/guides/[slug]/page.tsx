import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedGuidePage } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
} from "@/lib/public-localization";
import {
  getLocalizedGuide,
  getLocalizedRouteChrome,
} from "@/server/public-localized-content";
import { listGuides } from "@/server/public-seo-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface LocalizedGuideRouteProps {
  params: Promise<{ locale: string; slug: string }>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.flatMap((locale) =>
    listGuides().map((guide) => ({
      locale,
      slug: guide.slug,
    })),
  );
}

export async function generateMetadata({
  params,
}: LocalizedGuideRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Guide | OverGarden",
      robots: missingState.robots,
    };
  }

  const guide = getLocalizedGuide(localeParam, slug);

  if (!guide) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Guide | OverGarden",
      robots: missingState.robots,
    };
  }

  const indexState = evaluatePublicSurfaceIndexability({ kind: guide.kind });

  return {
    title: `${guide.title} | OverGarden`,
    description: guide.description,
    alternates: {
      canonical: localizedPath(localeParam, guide.path),
      languages: buildLanguageAlternates(guide.path),
    },
    robots: indexState.robots,
    openGraph: {
      locale: localeParam,
    },
  };
}

export default async function GuideRoute({ params }: LocalizedGuideRouteProps) {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  const guide = getLocalizedGuide(localeParam, slug);

  if (!guide) notFound();

  return (
    <LocalizedGuidePage
      locale={localeParam}
      guide={guide}
      chrome={getLocalizedRouteChrome(localeParam)}
      availableLocales={getLanguageSwitcherLocales(localeParam)}
    />
  );
}
