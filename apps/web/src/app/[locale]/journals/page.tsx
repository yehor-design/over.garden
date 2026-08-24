import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  PublicJournalDirectory,
  type PublicJournalDirectoryState,
} from "@/components/public/public-journal-directory";
import { getPublicJournalDirectoryCopy } from "@/lib/public-journal-directory-copy";
import {
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import { resolveVisualFixturePublicJournalDirectoryMode } from "@/lib/visual-fixtures/public-journal-directory-scenarios";
import {
  listPublicJournalDirectoryFacets,
  listPublicJournalDirectoryPage,
  resolvePublicJournalDirectorySearchScope,
  normalizePublicJournalDirectoryRequest,
  type PublicJournalDirectoryFacets,
  type PublicJournalDirectoryPage,
} from "@/server/public-journal-directory-repository";
import {
  latestMeaningfulContentTimestamp,
  PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfaceDiscoveryWithDeadline,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import { AUTHORED_PUBLIC_SURFACE_LASTMOD } from "@/server/public-surface-indexing-policy";

interface PublicJournalsRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PublicJournalsRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery(
        "localized_journals_directory",
      ).decision.robots,
    };
  }

  const request = normalizePublicJournalDirectoryRequest({});
  const discovery = await resolvePublicSurfaceDiscoveryWithDeadline({
    consumerId: "localized_journals_directory",
    evaluatedAt: new Date(),
    deadlineMs: PUBLIC_SURFACE_DISCOVERY_DEADLINE_MS,
    loadSource: async () => {
      const [page, facets] = await Promise.all([
        listPublicJournalDirectoryPage(request, localeParam),
        listPublicJournalDirectoryFacets(),
      ]);
      return buildJournalDirectoryDiscoverySource(
        localeParam,
        page,
        facets,
        false,
      );
    },
  });
  return buildJournalDirectorySurface(
    localeParam,
    emptyPublicJournalDirectoryPage(request),
    discovery,
  ).metadata;
}

export async function renderPublicJournalsPage(
  locale: PublicLocale,
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  const request = normalizePublicJournalDirectoryRequest(searchParams);
  const visualMode = resolveVisualFixturePublicJournalDirectoryMode(
    searchParams,
    process.env,
  );
  if (visualMode === "loading" || visualMode === "error") {
    return (
      <PublicJournalDirectory
        locale={locale}
        copy={getPublicJournalDirectoryCopy(locale)}
        page={emptyPublicJournalDirectoryPage(request)}
        facets={emptyPublicJournalDirectoryFacets()}
        state={visualMode}
      />
    );
  }

  const visualCorpus = visualMode === "corpus";
  const restrictedEntryIds = visualCorpus
    ? await loadVisualFixturePublicJournalEntryIds()
    : null;
  const searchScopePromise = resolvePublicJournalDirectorySearchScope(request, {
    restrictToEntryIds: restrictedEntryIds,
    contentClassMode: visualCorpus ? "visual_fixture" : "launch",
    ...(visualCorpus
      ? {
          findSearchCandidates: async () => ({
            source: "bounded_fallback" as const,
            ids: null,
            reason: "unavailable" as const,
          }),
        }
      : {}),
  });
  const pagePromise = searchScopePromise.then((searchScope) =>
    visualCorpus
      ? listPublicJournalDirectoryPage(request, locale, {
          restrictToEntryIds: restrictedEntryIds,
          searchScope,
          contentClassMode: "visual_fixture",
        })
      : listPublicJournalDirectoryPage(request, locale, { searchScope }),
  );
  const facetsPromise = searchScopePromise.then((searchScope) =>
    visualCorpus
      ? listPublicJournalDirectoryFacets({
          restrictToEntryIds: restrictedEntryIds,
          searchScope,
          contentClassMode: "visual_fixture",
        })
      : listPublicJournalDirectoryFacets({ searchScope }),
  );

  const [pageResult, facetsResult] = await Promise.allSettled([
    pagePromise,
    facetsPromise,
  ]);
  const failed =
    pageResult.status === "rejected" || facetsResult.status === "rejected";
  const page =
    pageResult.status === "fulfilled"
      ? pageResult.value
      : emptyPublicJournalDirectoryPage(request);
  const facets =
    facetsResult.status === "fulfilled"
      ? facetsResult.value
      : emptyPublicJournalDirectoryFacets();
  const state: PublicJournalDirectoryState = failed
    ? "error"
    : page.cards.length === 0
      ? "empty"
      : "ready";
  const discovery = resolvePublicSurfaceDiscoveryForRequest(
    buildJournalDirectoryDiscoverySource(
      locale,
      page,
      facets,
      Boolean(visualMode),
    ),
  );
  const surface = buildJournalDirectorySurface(locale, page, discovery);

  return (
    <PublicJournalDirectory
      locale={locale}
      copy={getPublicJournalDirectoryCopy(locale)}
      page={page}
      facets={facets}
      state={state}
      visualCorpus={visualCorpus}
      jsonLd={surface.jsonLd}
    />
  );
}

export default async function PublicJournalsRoute({
  params,
  searchParams,
}: PublicJournalsRouteProps) {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) notFound();

  return renderPublicJournalsPage(localeParam, (await searchParams) ?? {});
}

export function emptyPublicJournalDirectoryPage(
  request: ReturnType<typeof normalizePublicJournalDirectoryRequest>,
): PublicJournalDirectoryPage {
  return {
    request,
    cards: [],
    totalCount: 0,
    totalPages: 1,
    hasPreviousPage: request.page > 1,
    hasNextPage: false,
    searchSource: "database",
    searchFallbackReason: null,
    qualityClass: "unverified",
  };
}

function buildJournalDirectoryDiscoverySource(
  locale: PublicLocale,
  page: PublicJournalDirectoryPage,
  facets: PublicJournalDirectoryFacets,
  isVisualFixture: boolean,
): PublicSurfaceDiscoverySource {
  const copy = getPublicJournalDirectoryCopy(locale);
  return {
    consumerId: "localized_journals_directory",
    candidateState: isVisualFixture ? "not_public_candidate" : "candidate",
    qualityClass: page.qualityClass ?? "unverified",
    visibleText: [
      copy.metadataTitle,
      copy.metadataDescription,
      copy.heading,
      copy.intro,
      ...page.cards.flatMap((card) => [
        card.title,
        card.excerpt,
        card.object.displayName,
        card.object.identityLabel ?? "",
        ...card.topics.map((topic) => topic.label),
      ]),
      ...facets.catalogs.map((facet) => facet.label),
      ...facets.topics.map((facet) => facet.label),
    ],
    distinctPublicEntityIds: [
      ...page.cards.flatMap((card) => [
        card.publicPath,
        card.object.publicPath,
      ]),
      ...facets.catalogs.map((facet) => `catalog:${facet.slug}`),
      ...facets.topics.map((facet) => `topic:${facet.slug}`),
    ],
    meaningfulContentAt:
      latestMeaningfulContentTimestamp(
        page.cards.map((card) => card.publishedAt),
      ) ?? AUTHORED_PUBLIC_SURFACE_LASTMOD,
    canonicalPath: localizedPath(locale, "/journals"),
    equivalentLocales: [locale],
  };
}

function buildJournalDirectorySurface(
  locale: PublicLocale,
  page: PublicJournalDirectoryPage,
  discovery: PublicSurfaceDiscoveryResult,
) {
  const copy = getPublicJournalDirectoryCopy(locale);
  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    visibleFacts: {
      type: "CollectionPage",
      name: copy.heading,
      description: copy.intro,
      itemNames: page.cards.map((card) => card.title),
    },
  });
}

export function emptyPublicJournalDirectoryFacets(): PublicJournalDirectoryFacets {
  return { kinds: [], catalogs: [], topics: [], regions: [] };
}

async function loadVisualFixturePublicJournalEntryIds() {
  const { VISUAL_FIXTURE_MANIFEST } =
    await import("@/lib/visual-fixtures/manifest");
  return VISUAL_FIXTURE_MANIFEST.entries.flatMap((entry) =>
    entry.visibility === "public" &&
    entry.lifecycleState === "active" &&
    entry.publicGoneAt === null &&
    entry.publicSlug !== null &&
    entry.publishedAt !== null
      ? [entry.id]
      : [],
  );
}
