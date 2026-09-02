import type { Metadata } from "next";
import { cache } from "react";
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
  type PublicFeedRequest,
  type TrustedPublicFeedTopic,
} from "@/server/public-feed-repository";
import { getLocalizedHomeContent } from "@/server/public-localized-content";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfaceDiscoveryFromLoad,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { getSiteShellSessionState } from "@/server/site-shell-session";

interface LocalizedHomeRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

/**
 * One feed read and one topic read per request: `generateMetadata` and the
 * page share them (React.cache). The request is keyed by its JSON form so the
 * default request built in both places resolves to the same read.
 */
const loadFeedPage = cache((locale: PublicLocale, requestKey: string) =>
  listPublicFeedPage(JSON.parse(requestKey) as PublicFeedRequest, locale),
);
const loadFeedTopics = cache((locale: PublicLocale) =>
  listTrustedPublicFeedTopics(undefined, 6, locale),
);

function feedRequestKey(request: PublicFeedRequest) {
  return JSON.stringify(request);
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
  const discovery = await resolvePublicSurfaceDiscoveryFromLoad({
    consumerId: "localized_home",
    loadSource: async () => {
      const [feed, topics] = await Promise.all([
        loadFeedPage(
          localeParam,
          feedRequestKey(normalizePublicFeedRequest({})),
        ),
        loadFeedTopics(localeParam),
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
  const feedPromise: Promise<PublicFeedPage> = loadFeedPage(
    locale,
    feedRequestKey(request),
  );
  const [feedResult, topicsResult, sessionResult] = await Promise.allSettled([
    feedPromise,
    loadFeedTopics(locale),
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
  return {
    consumerId: "localized_home",
    candidateState: "candidate",
    visibleText: [
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
