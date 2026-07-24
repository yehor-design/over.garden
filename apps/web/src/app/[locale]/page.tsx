import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedHomePage } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  filterVisualFixturePublicFeedTopics,
  resolveVisualFixturePublicFeedScenario,
} from "@/lib/visual-fixtures/public-feed-scenarios";
import {
  listPublicFeedPage,
  listTrustedPublicFeedTopics,
  normalizePublicFeedRequest,
  type PublicFeedPage,
  type TrustedPublicFeedTopic,
} from "@/server/public-feed-repository";
import { getLocalizedHomeContent } from "@/server/public-localized-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";
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
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "OverGarden",
      robots: missingState.robots,
    };
  }

  const content = getLocalizedHomeContent(localeParam);
  const indexState = evaluatePublicSurfaceIndexability({
    kind: "public_feed",
  });

  return {
    title: content.title,
    description: content.description,
    alternates: {
      canonical: localizedPath(localeParam, "/"),
      languages: buildLanguageAlternates("/"),
    },
    robots: indexState.robots,
    openGraph: {
      locale: localeParam,
    },
  };
}

export async function renderLocalizedHomePage(
  locale: PublicLocale,
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  const visualScenario = resolveVisualFixturePublicFeedScenario(
    searchParams,
    process.env,
  );
  const request =
    visualScenario?.requestOverride ?? normalizePublicFeedRequest(searchParams);
  const feedPromise: Promise<PublicFeedPage> =
    visualScenario?.mode === "loading" || visualScenario?.mode === "error"
      ? Promise.resolve({ entries: [], nextCursor: null })
      : listPublicFeedPage(request, locale);
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
    visualScenario?.hideTopics || topicsResult.status === "rejected"
      ? []
      : filterVisualFixturePublicFeedTopics(topicsResult.value, process.env);
  const state =
    visualScenario?.mode === "loading"
      ? "loading"
      : visualScenario?.mode === "error" || feedResult.status === "rejected"
        ? "error"
        : feed.entries.length === 0
          ? "empty"
          : "ready";

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
    />
  );
}

export default async function HomeRoute({
  params,
  searchParams,
}: LocalizedHomeRouteProps) {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) notFound();

  return renderLocalizedHomePage(localeParam, (await searchParams) ?? {});
}
