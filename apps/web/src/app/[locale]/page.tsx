import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedHomePage } from "@/components/public/localized-public-pages";
import {
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  listPublicFeedPage,
  listTrustedPublicFeedTopics,
  normalizePublicFeedRequest,
  type PublicFeedPage,
  type TrustedPublicFeedTopic,
} from "@/server/public-feed-repository";
import { getLocalizedHomeContent } from "@/server/public-localized-content";
import {
  combinePublicProjectionQualityClasses,
  latestMeaningfulContentTimestamp,
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfaceDiscoveryWithDeadline,
  resolveUnresolvedPublicSurfaceDiscovery,
  PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { AUTHORED_PUBLIC_SURFACE_LASTMOD } from "@/server/public-surface-indexing-policy";
import { getSiteShellSessionState } from "@/server/site-shell-session";

interface LocalizedHomeRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocalizedHomeRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) {
    const missingState =
      resolveUnresolvedPublicSurfaceDiscovery("localized_home").decision;

    return {
      title: "OverGarden",
      robots: missingState.robots,
    };
  }

  const content = getLocalizedHomeContent(localeParam);
  const discovery = await resolvePublicSurfaceDiscoveryWithDeadline({
    consumerId: "localized_home",
    evaluatedAt: new Date(),
    deadlineMs: PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
    loadSource: async () => {
      const [feed, topics] = await Promise.all([
        listPublicFeedPage(normalizePublicFeedRequest({}), localeParam),
        listTrustedPublicFeedTopics(undefined, 6, localeParam),
      ]);
      return buildHomeDiscoverySource(localeParam, content, feed, topics);
    },
  });
  return buildHomeSurface(localeParam, content, [], discovery).metadata;
}

export async function renderLocalizedHomePage(
  locale: PublicLocale,
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  const request = normalizePublicFeedRequest(searchParams);
  const feedPromise: Promise<PublicFeedPage> = listPublicFeedPage(
    request,
    locale,
  );
  const [feedResult, topicsResult, sessionResult] = await Promise.allSettled([
    feedPromise,
    listTrustedPublicFeedTopics(undefined, 6, locale),
    getSiteShellSessionState(),
  ]);
  const feed: PublicFeedPage =
    feedResult.status === "fulfilled"
      ? feedResult.value
      : { entries: [], nextCursor: null };
  const topics: TrustedPublicFeedTopic[] =
    topicsResult.status === "rejected" ? [] : topicsResult.value;
  const state =
    feedResult.status === "rejected"
      ? "error"
      : feed.entries.length === 0
        ? "empty"
        : "ready";
  const discovery = resolvePublicSurfaceDiscoveryForRequest(
    buildHomeDiscoverySource(
      locale,
      getLocalizedHomeContent(locale),
      feed,
      topics,
    ),
  );
  const surface = buildHomeSurface(
    locale,
    getLocalizedHomeContent(locale),
    feed.entries,
    discovery,
  );

  return (
    <LocalizedHomePage
      locale={locale}
      content={getLocalizedHomeContent(locale)}
      feed={feed}
      request={request}
      topics={topics}
      isAuthenticated={
        sessionResult.status === "fulfilled" &&
        sessionResult.value.isAuthenticated
      }
      state={state}
      jsonLd={surface.jsonLd}
    />
  );
}

function buildHomeDiscoverySource(
  locale: PublicLocale,
  content: ReturnType<typeof getLocalizedHomeContent>,
  feed: PublicFeedPage,
  topics: readonly TrustedPublicFeedTopic[],
): PublicSurfaceDiscoverySource {
  const feedCopyText = Object.values(content.feed).flatMap((value) =>
    typeof value === "string"
      ? [value]
      : Object.values(value).filter(
          (item): item is string => typeof item === "string",
        ),
  );
  return {
    consumerId: "localized_home",
    candidateState: "candidate",
    qualityClass: combinePublicProjectionQualityClasses(
      feed.entries.map((entry) => entry.qualityClass),
    ),
    visibleText: [
      content.title,
      content.description,
      ...feedCopyText,
      ...feed.entries.flatMap((entry) => [
        entry.title,
        entry.excerpt,
        entry.object.displayName,
        ...entry.topics.map((topic) => topic.label),
      ]),
      ...topics.map((topic) => topic.label),
    ],
    distinctPublicEntityIds: [
      ...feed.entries.flatMap((entry) => [entry.id, entry.object.id]),
      ...topics.map((topic) => `topic:${topic.slug}`),
    ],
    meaningfulContentAt:
      latestMeaningfulContentTimestamp(
        feed.entries.map((entry) => entry.publishedAt),
      ) ?? AUTHORED_PUBLIC_SURFACE_LASTMOD,
    canonicalPath: localizedPath(locale, "/"),
    equivalentLocales: [locale],
  };
}

function buildHomeSurface(
  locale: PublicLocale,
  content: ReturnType<typeof getLocalizedHomeContent>,
  entries: readonly PublicFeedPage["entries"][number][],
  discovery: ReturnType<typeof resolvePublicSurfaceDiscoveryForRequest>,
) {
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: content.title,
    description: content.description,
    visibleFacts: {
      type: "CollectionPage",
      name: content.feed.heading,
      description: content.description,
      itemNames: entries.map((entry) => entry.title),
    },
  });
}

export default async function HomeRoute({
  params,
  searchParams,
}: LocalizedHomeRouteProps) {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  return renderLocalizedHomePage(localeParam, (await searchParams) ?? {});
}
