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
import {
  listPublicJournalDirectoryFacets,
  listPublicJournalDirectoryPage,
  resolvePublicJournalDirectorySearchScope,
  normalizePublicJournalDirectoryRequest,
  type PublicJournalDirectoryFacets,
  type PublicJournalDirectoryPage,
} from "@/server/public-journal-directory-repository";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfaceDiscoveryFromLoad,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
  type PublicSurfaceDiscoverySource,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import {
  readPublicJournalDirectoryFacets,
  readPublicJournalDirectoryPage,
} from "@/server/public-cache";

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
  const discovery = await resolvePublicSurfaceDiscoveryFromLoad({
    consumerId: "localized_journals_directory",
    loadSource: async () => {
      const [page, facets] = await Promise.all([
        readPublicJournalDirectoryPage(request, localeParam),
        readPublicJournalDirectoryFacets(),
      ]);
      return buildJournalDirectoryDiscoverySource(localeParam, page, facets);
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
  const searchScopePromise = resolvePublicJournalDirectorySearchScope(request, {
    restrictToEntryIds: null,
  });
  // A directory without a search query is the cached listing (ADR-0022, D4);
  // a search resolves its scope at request time and reads the repository.
  const pagePromise = request.query
    ? searchScopePromise.then((searchScope) =>
        listPublicJournalDirectoryPage(request, locale, { searchScope }),
      )
    : readPublicJournalDirectoryPage(request, locale);
  const facetsPromise = request.query
    ? searchScopePromise.then((searchScope) =>
        listPublicJournalDirectoryFacets({ searchScope }),
      )
    : readPublicJournalDirectoryFacets();

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
    buildJournalDirectoryDiscoverySource(locale, page, facets),
  );
  const surface = buildJournalDirectorySurface(locale, page, discovery);

  return (
    <PublicJournalDirectory
      locale={locale}
      copy={getPublicJournalDirectoryCopy(locale)}
      page={page}
      facets={facets}
      state={state}
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
): PublicSurfaceDiscoverySource {
  return {
    consumerId: "localized_journals_directory",
    candidateState: "candidate",
    visibleText: [
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
