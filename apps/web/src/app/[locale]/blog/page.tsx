import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedBlogIndexPage } from "@/components/public/localized-public-pages";
import {
  getLanguageSwitcherLocales,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  BLOG_INDEX_PATH,
  getContentAvailableLocales,
  getLocalizedBlogIndexContent,
  listLocalizedBlogPosts,
} from "@/server/public-localized-content";
import { AUTHORED_PUBLIC_SURFACE_LASTMOD } from "@/server/public-surface-indexing-policy";
import {
  authoredContentEntityIds,
  resolveAuthoredPublicSurfaceDiscovery,
  type BlogPostContent,
} from "@/server/public-seo-content";
import { resolveUnresolvedPublicSurfaceDiscovery } from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";

interface LocalizedBlogIndexRouteProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocalizedBlogIndexRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) {
    const missingState = resolveUnresolvedPublicSurfaceDiscovery(
      "localized_blog_index",
    ).decision;

    return {
      title: "OverGarden",
      robots: missingState.robots,
    };
  }

  const content = getLocalizedBlogIndexContent(localeParam);
  const posts = listLocalizedBlogPosts(localeParam);
  return buildBlogIndexSurface(localeParam, content, posts).metadata;
}

export default async function BlogIndexRoute({
  params,
}: LocalizedBlogIndexRouteProps) {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  const content = getLocalizedBlogIndexContent(localeParam);
  const posts = listLocalizedBlogPosts(localeParam);
  const surface = buildBlogIndexSurface(localeParam, content, posts);

  return (
    <LocalizedBlogIndexPage
      locale={localeParam}
      content={content}
      posts={posts}
      availableLocales={getLanguageSwitcherLocales(localeParam)}
      jsonLd={surface.jsonLd}
    />
  );
}

function buildBlogIndexSurface(
  locale: PublicLocale,
  content: ReturnType<typeof getLocalizedBlogIndexContent>,
  posts: BlogPostContent[],
) {
  const equivalentLocales = getContentAvailableLocales(BLOG_INDEX_PATH);
  const discovery = resolveAuthoredPublicSurfaceDiscovery({
    consumerId: "localized_blog_index",
    canonicalPath: localizedPath(locale, BLOG_INDEX_PATH),
    equivalentLocales,
    visibleText: [
      content.title,
      content.description,
      content.eyebrow,
      content.heading,
      content.intro,
      content.startTitle,
      content.startBody,
      ...posts.flatMap((post) => [post.title, post.excerpt]),
    ],
    distinctPublicEntityIds: authoredContentEntityIds(
      BLOG_INDEX_PATH,
      posts.map((post) => post.path),
    ),
    meaningfulContentAt: AUTHORED_PUBLIC_SURFACE_LASTMOD,
  });
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: content.title,
    description: content.description,
    visibleFacts: {
      type: "CollectionPage",
      name: content.heading,
      description: content.intro,
      itemNames: posts.map((post) => post.title),
      trustQualifier: "OverGarden editorial",
    },
  });
}
