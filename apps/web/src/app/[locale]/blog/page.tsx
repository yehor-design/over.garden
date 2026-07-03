import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedBlogIndexPage } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  PUBLIC_LOCALES,
} from "@/lib/public-localization";
import {
  BLOG_INDEX_PATH,
  getLocalizedBlogIndexContent,
  listLocalizedBlogPosts,
} from "@/server/public-localized-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface LocalizedBlogIndexRouteProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocalizedBlogIndexRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Field notes | OverGarden",
      robots: missingState.robots,
    };
  }

  const content = getLocalizedBlogIndexContent(localeParam);
  const indexState = evaluatePublicSurfaceIndexability({
    kind: "editorial_blog",
  });

  return {
    title: content.title,
    description: content.description,
    alternates: {
      canonical: localizedPath(localeParam, BLOG_INDEX_PATH),
      languages: buildLanguageAlternates(BLOG_INDEX_PATH),
    },
    robots: indexState.robots,
    openGraph: {
      locale: localeParam,
    },
  };
}

export default async function BlogIndexRoute({
  params,
}: LocalizedBlogIndexRouteProps) {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  return (
    <LocalizedBlogIndexPage
      locale={localeParam}
      content={getLocalizedBlogIndexContent(localeParam)}
      posts={listLocalizedBlogPosts(localeParam)}
      availableLocales={PUBLIC_LOCALES}
    />
  );
}
