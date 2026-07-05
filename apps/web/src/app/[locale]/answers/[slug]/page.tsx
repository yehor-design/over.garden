import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedAnswerPage } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
} from "@/lib/public-localization";
import {
  getLocalizedAnswerPage,
  getLocalizedRouteChrome,
} from "@/server/public-localized-content";
import { listAnswerPages } from "@/server/public-seo-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface LocalizedAnswerRouteProps {
  params: Promise<{ locale: string; slug: string }>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.flatMap((locale) =>
    listAnswerPages().map((page) => ({
      locale,
      slug: page.slug,
    })),
  );
}

export async function generateMetadata({
  params,
}: LocalizedAnswerRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Answer | OverGarden",
      robots: missingState.robots,
    };
  }

  const page = getLocalizedAnswerPage(localeParam, slug);

  if (!page) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Answer | OverGarden",
      robots: missingState.robots,
    };
  }

  const indexState = evaluatePublicSurfaceIndexability({ kind: page.kind });

  return {
    title: `${page.title} | OverGarden`,
    description: page.description,
    alternates: {
      canonical: localizedPath(localeParam, page.path),
      languages: buildLanguageAlternates(page.path),
    },
    robots: indexState.robots,
    openGraph: {
      locale: localeParam,
    },
  };
}

export default async function AnswerRoute({
  params,
}: LocalizedAnswerRouteProps) {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  const page = getLocalizedAnswerPage(localeParam, slug);

  if (!page) notFound();

  return (
    <LocalizedAnswerPage
      locale={localeParam}
      page={page}
      chrome={getLocalizedRouteChrome(localeParam)}
      availableLocales={getLanguageSwitcherLocales(localeParam)}
    />
  );
}
