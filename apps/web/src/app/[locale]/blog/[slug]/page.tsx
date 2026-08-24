import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedBlogPostPage } from "@/components/public/localized-public-pages";
import {
  getLanguageSwitcherLocales,
  isPublicLocale,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  getLocalizedBlogPost,
  getContentAvailableLocales,
  getLocalizedRouteChrome,
} from "@/server/public-localized-content";
import {
  authoredContentEntityIds,
  blogPostVisibleText,
  listBlogPosts,
  resolveAuthoredPublicSurfaceDiscovery,
  type BlogPostContent,
} from "@/server/public-seo-content";
import { resolveUnresolvedPublicSurfaceDiscovery } from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

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
    const missingState = resolveUnresolvedPublicSurfaceDiscovery(
      "localized_blog_post",
    ).decision;

    return {
      title: "OverGarden",
      robots: missingState.robots,
    };
  }

  const post = getLocalizedBlogPost(localeParam, slug);

  if (!post) {
    const missingState = resolveUnresolvedPublicSurfaceDiscovery(
      "localized_blog_post",
    ).decision;

    return {
      title: `${getLocalizedRouteChrome(localeParam).fieldNotesBack} | OverGarden`,
      robots: missingState.robots,
    };
  }

  return buildBlogPostSurface(localeParam, post).metadata;
}

export default async function BlogPostRoute({
  params,
}: LocalizedBlogPostRouteProps) {
  const { locale: localeParam, slug } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  const post = getLocalizedBlogPost(localeParam, slug);

  if (!post) notFound();

  const surface = buildBlogPostSurface(localeParam, post);

  return (
    <LocalizedBlogPostPage
      locale={localeParam}
      post={post}
      chrome={getLocalizedRouteChrome(localeParam)}
      availableLocales={getLanguageSwitcherLocales(localeParam)}
      jsonLd={surface.jsonLd}
    />
  );
}

function buildBlogPostSurface(locale: PublicLocale, post: BlogPostContent) {
  const discovery = resolveAuthoredPublicSurfaceDiscovery({
    consumerId: "localized_blog_post",
    canonicalPath: locale === "uk" ? post.path : `/${locale}${post.path}`,
    equivalentLocales: getContentAvailableLocales(post.path),
    visibleText: blogPostVisibleText(post),
    distinctPublicEntityIds: authoredContentEntityIds(
      post.path,
      post.relatedLinks.map((link) => link.href),
    ),
    meaningfulContentAt: `${post.publishedDate}T00:00:00.000Z`,
  });
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: `${post.title} | OverGarden`,
    description: post.description,
    visibleFacts: {
      type: "Article",
      name: post.title,
      description: post.description,
      datePublished: `${post.publishedDate}T00:00:00.000Z`,
      trustQualifier: "OverGarden editorial",
    },
  });
}
