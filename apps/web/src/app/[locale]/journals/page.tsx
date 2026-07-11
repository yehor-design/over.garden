import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  PublicJournalDirectory,
  type PublicJournalDirectoryState,
} from "@/components/public/public-journal-directory";
import { getPublicJournalDirectoryCopy } from "@/lib/public-journal-directory-copy";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  PREFIXED_PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import { resolveVisualFixturePublicJournalDirectoryMode } from "@/lib/visual-fixtures/public-journal-directory-scenarios";
import {
  listPublicJournalDirectoryFacets,
  listPublicJournalDirectoryPage,
  normalizePublicJournalDirectoryRequest,
  type PublicJournalDirectoryFacets,
  type PublicJournalDirectoryPage,
} from "@/server/public-journal-directory-repository";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

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
      robots: evaluatePublicSurfaceIndexability({ kind: "missing" }).robots,
    };
  }

  const copy = getPublicJournalDirectoryCopy(localeParam);
  const indexState = evaluatePublicSurfaceIndexability({
    kind: "catalog_browse",
  });

  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    alternates: {
      canonical: localizedPath(localeParam, "/journals"),
      languages: buildLanguageAlternates("/journals"),
    },
    robots: indexState.robots,
    openGraph: { locale: localeParam },
  };
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
  const pagePromise = visualCorpus
    ? listPublicJournalDirectoryPage(request, locale, {
        restrictToEntryIds: restrictedEntryIds,
        findSearchCandidates: async () => null,
      })
    : listPublicJournalDirectoryPage(request, locale);
  const facetsPromise = visualCorpus
    ? listPublicJournalDirectoryFacets({
        restrictToEntryIds: restrictedEntryIds,
      })
    : listPublicJournalDirectoryFacets();

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

  return (
    <PublicJournalDirectory
      locale={locale}
      copy={getPublicJournalDirectoryCopy(locale)}
      page={page}
      facets={facets}
      state={state}
      visualCorpus={visualCorpus}
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
  };
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
