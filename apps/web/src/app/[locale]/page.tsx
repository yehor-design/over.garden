import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";

import { LocalizedHomePage } from "@/components/public/localized-public-pages";
import {
  isPublicLocale,
  localizedPath,
  type PublicLocale,
  PUBLIC_LOCALES,
} from "@/lib/public-localization";
import {
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
import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  type PublicRenderPhase,
} from "@/server/static-public-page";
import {
  describeWorkspaceFailure,
  type WorkspaceFailureDescription,
} from "@/server/workspace-failure";
import {
  readPublicFeedPage,
  readTrustedPublicFeedTopics,
} from "@/server/public-cache";

interface LocalizedHomeRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
}

/**
 * One feed read and one topic read per request: `generateMetadata` and the
 * page share them (React.cache). The request is keyed by its JSON form so the
 * default request built in both places resolves to the same read.
 */
const loadFeedPage = cache((locale: PublicLocale, requestKey: string) =>
  readPublicFeedPage(JSON.parse(requestKey) as PublicFeedRequest, locale),
);
const loadFeedTopics = cache((locale: PublicLocale) =>
  readTrustedPublicFeedTopics(locale),
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
    // Prerendered with the page it describes (ADR-0032 D4).
    document: "static",
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

/**
 * The feed, for one request against it.
 *
 * With the default request this is a static document (ADR-0032): both reads
 * are `use cache` reads, nothing here asks who is reading or what the query
 * string says, and the first card's photograph is in the served HTML. A
 * filtered or paged feed is the same function called from the request-time
 * twin at `/q`, which is where a query string is read.
 */
export async function renderLocalizedHomePage(
  locale: PublicLocale,
  searchParams: Record<string, string | string[] | undefined> = {},
  /** `"static"` only from `renderStaticPublicPage`; the twin is a request already. */
  phase: PublicRenderPhase = "request",
) {
  const request = normalizePublicFeedRequest(searchParams);
  await deferStaticRenderWithoutDatabase(phase);
  const feedPromise: Promise<PublicFeedPage> = loadFeedPage(
    locale,
    feedRequestKey(request),
  );
  const [feedResult, topicsResult] = await Promise.allSettled([
    feedPromise,
    loadFeedTopics(locale),
  ]);
  // A failure is settled into a designed state below — for this reader. It is
  // never prerendered into the shell every reader gets (ADR-0032 D4).
  if (feedResult.status === "rejected" || topicsResult.status === "rejected") {
    deferStaticRenderAfterFailure(phase);
  }
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
  // ADR-0023: the failure is a value the page settles, not an exception the
  // screen inherits. The class travels as `data-section-failure` and the digest
  // is the one string the reader and the log line share.
  const failure: WorkspaceFailureDescription | null =
    feedResult.status === "rejected"
      ? describeWorkspaceFailure(feedResult.reason)
      : null;
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
      state={state}
      failure={failure}
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
    equivalentLocales: [...PUBLIC_LOCALES],
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
}: Pick<LocalizedHomeRouteProps, "params">) {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  // No `searchParams` here, on purpose: reading them is what made this page
  // dynamic from its first line. A request that carries a filter or a cursor
  // is rewritten by the proxy to the twin at `/q`, which reads them.
  return renderStaticPublicPage({
    fallback: <RootLoadingSkeleton />,
    render: (phase) => renderLocalizedHomePage(localeParam, {}, phase),
  });
}
