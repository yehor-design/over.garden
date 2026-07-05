import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedBlogPostPage } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
} from "@/lib/public-localization";
import {
  getLocalizedBlogPost,
  getLocalizedRouteChrome,
} from "@/server/public-localized-content";
import { listBlogPosts } from "@/server/public-seo-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface LocalizedBlogPostRouteProps {
  params: Promise<{ locale: string; slug: string }>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.flatMap((locale) =>
    listBlogPosts().map((post) => ({
      locale,
      slug: post.slug,
    })),
  );
}

export async function generateMetadata({
  params,
}: LocalizedBlogPostRouteProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Field note | OverGarden",
      robots: missingState.robots,
    };
  }

  const post = getLocalizedBlogPost(localeParam, slug);

  if (!post) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Field note | OverGarden",
      robots: missingState.robots,
    };
  }

  const indexState = evaluatePublicSurfaceIndexability({ kind: post.kind });

  return {
    title: `${post.title} | OverGarden`,
    description: post.description,
    alternates: {
      canonical: localizedPath(localeParam, post.path),
      languages: buildLanguageAlternates(post.path),
    },
    robots: indexState.robots,
    openGraph: {
      locale: localeParam,
    },
  };
}

export default async function BlogPostRoute({
  params,
}: LocalizedBlogPostRouteProps) {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  const post = getLocalizedBlogPost(localeParam, slug);

  if (!post) notFound();

  return (
    <LocalizedBlogPostPage
      locale={localeParam}
      post={post}
      chrome={getLocalizedRouteChrome(localeParam)}
      availableLocales={getLanguageSwitcherLocales(localeParam)}
    />
  );
}
