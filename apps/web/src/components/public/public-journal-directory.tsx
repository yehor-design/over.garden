import Link from "next/link";
import { MapPinIcon as MapPin } from "@/components/icons/MapPin";
import { ChatCircleIcon as MessageCircle } from "@/components/icons/ChatCircle";
import { PawPrintIcon as PawPrint } from "@/components/icons/PawPrint";
import { MagnifyingGlassIcon as Search } from "@/components/icons/MagnifyingGlass";
import { PlantIcon as Sprout } from "@/components/icons/Plant";

import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryCard } from "@/components/ui/entry-card";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { FilterBar, type FilterBarFacet } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { getFilterBarChromeCopy } from "@/lib/filter-bar-copy";
import { entryCardDates, getEntryCardCopy } from "@/lib/entry-card-dates";
import { entryCardMedia } from "@/lib/entry-card-media";
import { resolveIllustration } from "@/lib/illustrations";
import { firstPhotographIndex } from "@/lib/media/first-photograph";
import { buildPublicJournalDirectoryHref } from "@/lib/public-journal-directory-navigation";
import type { PublicJournalDirectoryCopy } from "@/lib/public-journal-directory-copy";
import {
  contentLanguageAttribute,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { isKindTopicSlug, localizeTopicLabel } from "@/lib/system-topic-labels";
import type {
  PublicJournalDirectoryCard,
  PublicJournalDirectoryFacets,
  PublicJournalDirectoryPage,
  PublicJournalDirectoryRequest,
} from "@/server/public-journal-directory-repository";
import type { WorkspaceFailureDescription } from "@/server/workspace-failure";

export { buildPublicJournalDirectoryHref } from "@/lib/public-journal-directory-navigation";

export type PublicJournalDirectoryState =
  | "ready"
  | "empty"
  | "loading"
  | "error";

const KIND_ICONS = {
  plant: <Sprout aria-hidden="true" className="size-4" />,
  animal: <PawPrint aria-hidden="true" className="size-4" />,
} as const;

/**
 * The journals directory, as the faceted pattern rather than as a form.
 *
 * Six equally loud `<select>`s became three tiers (DESIGN.md §5.1, OVE-482):
 * the search, plants-or-animals as the one mode, and every other facet behind
 * one "Filters (n)" button whose panel is a draft until "Show results". The
 * active filters sit above the results as removable chips, the count is always
 * visible and announced, and sort is its own control.
 *
 * The page stays a full, crawlable, no-JavaScript search page — it is one of
 * the product's main index surfaces (ADR-0022 D3) — which is why the bar is a
 * real `<form method="get">` and the search field submits on `Enter`.
 */
export function PublicJournalDirectory({
  locale,
  copy,
  page,
  facets,
  state,
  failure = null,
  jsonLd,
}: {
  locale: PublicLocale;
  copy: PublicJournalDirectoryCopy;
  page: PublicJournalDirectoryPage;
  facets: PublicJournalDirectoryFacets;
  state: PublicJournalDirectoryState;
  /** The settled failure class behind `state="error"` (ADR-0023). */
  failure?: WorkspaceFailureDescription | null;
  jsonLd?: Record<string, unknown> | null;
}) {
  const contextModules = buildPublicJournalDirectoryContextModules(
    locale,
    copy,
    facets,
  );
  const activeFilters = buildActiveFilters(copy, page.request, facets, locale);
  const chrome = getFilterBarChromeCopy(locale);
  const filterFacets = buildFilterFacets(copy, page.request, facets, locale);
  const appliedFacetCount = filterFacets.filter(
    (facet) => facet.value.length > 0,
  ).length;
  const clearFiltersHref = buildPublicJournalDirectoryHref(
    locale,
    clearSecondaryFilters(page.request),
  );
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);
  const listingPath = localizedPath(locale, "/journals");
  const firstPhotograph = firstPhotographIndex(
    page.cards,
    (card) => card.media.length > 0,
  );
  const countLabel =
    state === "ready" || state === "empty"
      ? copy.resultCount(page.totalCount)
      : "";

  return (
    <main
      lang={locale}
      data-public-journal-directory="true"
      data-public-journal-directory-state={state}
      data-public-journal-search-source={page.searchSource}
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <SiteShellContextRailRegistration modules={contextModules} />

      <PageHeader title={copy.heading} description={copy.intro} />

      <FilterBar
        documentNavigation
        action={listingPath}
        /* The search field and its own submit, the real submit of the bar's
           GET form: it sends the committed filters with the query, which is
           what makes this page search for a crawler and for a reader whose
           bundle never arrived. */
        search={
          <div className="flex items-end gap-2">
            <Field
              label={copy.searchLabel}
              id="journal-directory-search"
              className="min-w-0 flex-1"
            >
              <SearchInput
                name="q"
                defaultValue={page.request.query}
                maxLength={120}
                placeholder={copy.searchPlaceholder}
              />
            </Field>
            <Button type="submit" className="shrink-0">
              <Search aria-hidden="true" />
              {copy.searchSubmit}
            </Button>
          </div>
        }
        facets={filterFacets}
        /* Plants or animals is the directory's one primary split, so it is a
           mode here and nowhere else — not a sixth select (OVE-482). */
        modes={(["all", "plant", "animal"] as const).map((kind) => ({
          label: copy.kinds[kind],
          href: buildPublicJournalDirectoryHref(locale, {
            ...page.request,
            kind,
            page: 1,
          }),
          current: page.request.kind === kind,
        }))}
        hidden={page.request.kind === "all" ? {} : { kind: page.request.kind }}
        carry={{ q: page.request.query }}
        sort={{
          key: "sort",
          value: page.request.sort,
          // A search is ordered by relevance and a browse by recency, so the
          // default depends on whether there is a query — and the default is
          // what the URL leaves out.
          defaultValue: page.request.query ? "relevance" : "recent",
          options: Object.entries(copy.sorts).map(([value, label]) => ({
            value,
            label,
          })),
        }}
        chips={activeFilters.map((filter) => ({
          key: filter.key,
          label: filter.label,
          removeHref: buildPublicJournalDirectoryHref(locale, filter.request),
          removeLabel: `${copy.removeFilter}: ${filter.label}`,
        }))}
        clearAllHref={listingPath}
        clearFiltersHref={clearFiltersHref}
        labels={{
          filters: copy.filtersLabel,
          openFilters: chrome.filtersWithCount(appliedFacetCount),
          sheetDescription: chrome.panelDescription,
          apply: chrome.showResults,
          close: chrome.close,
          clear: chrome.clearFilters,
          clearAll: copy.resetFilters,
          activeFilters: copy.activeFiltersLabel,
          sort: copy.sortLabel,
          modes: chrome.modes,
          pending: chrome.pending,
        }}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
        <h2 className="text-h2 text-text-heading">{copy.resultsTitle}</h2>
        {/* Always rendered, so the node survives a filter change and the new
            number is announced *into* it. A live region that arrives with a
            fresh document announces nothing, which is why a filter change is a
            router navigation rather than a form submit once hydrated. */}
        <p
          data-journal-result-count="true"
          aria-live="polite"
          className="text-body-sm text-text-muted tabular-nums"
        >
          {countLabel}
        </p>
      </div>

      {page.request.query && page.searchSource === "bounded_fallback" ? (
        <Callout
          tone="warning"
          live="polite"
          title={copy.degradedSearchTitle}
          data-public-journal-search-degraded="true"
        >
          <p>{copy.degradedSearchBody}</p>
        </Callout>
      ) : null}

      {state === "loading" ? (
        <DirectoryLoading label={copy.loadingLabel} />
      ) : null}

      {state === "error" ? (
        <ErrorState
          failureClass={failure?.failureClass ?? "unknown"}
          digest={failure?.digest ?? "0000000"}
          title={copy.errorTitle}
          description={copy.errorBody}
          reference={`${copy.errorReference} ${failure?.digest ?? "0000000"}`}
          retryHref={buildPublicJournalDirectoryHref(locale, page.request)}
          retryLabel={copy.retry}
        />
      ) : null}

      {state === "empty" ? (
        <DirectoryEmpty
          locale={locale}
          copy={copy}
          chrome={chrome}
          filters={activeFilters}
          listingPath={listingPath}
          clearFiltersHref={appliedFacetCount > 0 ? clearFiltersHref : null}
        />
      ) : null}

      {state === "ready" ? (
        <>
          <ol className="grid list-none gap-4">
            {page.cards.map((card, index) => (
              <li key={card.publicPath} className="min-w-0">
                <DirectoryResultCard
                  locale={locale}
                  copy={copy}
                  request={page.request}
                  card={card}
                  priority={index === firstPhotograph}
                />
              </li>
            ))}
          </ol>
          {/* One page of results needs no navigation: two disabled edges with
              "Сторінка 1 з 1" between them is three controls saying the same
              nothing, and at 375 px they wrap into three columns of two words
              each. The count above already says how many there are. */}
          {page.hasPreviousPage || page.hasNextPage ? (
            <Pagination
              label={copy.paginationLabel}
              previousLabel={copy.previousPage}
              previousHref={
                page.hasPreviousPage
                  ? buildPublicJournalDirectoryHref(locale, {
                      ...page.request,
                      page: Math.max(1, page.request.page - 1),
                    })
                  : null
              }
              nextLabel={copy.loadMore}
              nextHref={
                page.hasNextPage
                  ? buildPublicJournalDirectoryHref(locale, {
                      ...page.request,
                      page: page.request.page + 1,
                    })
                  : null
              }
              status={formatPageLabel(
                copy.pageLabel,
                page.request.page,
                page.totalPages,
                locale,
              )}
            />
          ) : null}
        </>
      ) : null}

      <div className="border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </div>
    </main>
  );
}

function buildFilterFacets(
  copy: PublicJournalDirectoryCopy,
  request: PublicJournalDirectoryRequest,
  facets: PublicJournalDirectoryFacets,
  locale: PublicLocale,
): FilterBarFacet[] {
  return [
    {
      key: "catalog",
      label: copy.catalogLabel,
      anyLabel: copy.allCatalogs,
      value: request.catalog ? [request.catalog] : [],
      options: facets.catalogs.map((catalog) => ({
        value: catalog.slug,
        label: catalog.label,
        count: catalog.count,
      })),
    },
    {
      key: "topic",
      label: copy.topicLabel,
      anyLabel: copy.allTopics,
      value: request.topic ? [request.topic] : [],
      options: facets.topics
        .filter(
          (topic) =>
            topic.slug === request.topic || !isKindTopicSlug(topic.slug),
        )
        .map((topic) => ({
          value: topic.slug,
          label: localizeTopicLabel(locale, topic.slug, topic.label),
          count: topic.count,
        })),
    },
    {
      key: "season",
      label: copy.seasonLabel,
      anyLabel: copy.seasons.all,
      value: request.season === "all" ? [] : [request.season],
      options: (["winter", "spring", "summer", "autumn"] as const).map(
        (season) => ({ value: season, label: copy.seasons[season] }),
      ),
    },
    {
      key: "region",
      label: copy.regionLabel,
      anyLabel: copy.allRegions,
      value: request.region ? [request.region] : [],
      options: facets.regions.map((region) => ({
        value: region.code,
        label: region.code,
        count: region.count,
      })),
    },
  ];
}

function DirectoryResultCard({
  locale,
  copy,
  request,
  card,
  priority,
}: {
  locale: PublicLocale;
  copy: PublicJournalDirectoryCopy;
  request: PublicJournalDirectoryRequest;
  card: PublicJournalDirectoryCard;
  priority: boolean;
}) {
  const directoryHref = buildPublicJournalDirectoryHref(locale, request);
  const entryHref = addDirectoryReturnTo(card.publicPath, directoryHref);
  // The observation date, with its season; publication only when it fell on
  // another day — the same meaning the feed's cards give a date (OG-UX-016).
  const dates = entryCardDates(locale, card.entryDate, card.publishedAt);

  return (
    <EntryCard
      id={card.publicPath}
      href={entryHref}
      title={card.title}
      headingLevel={3}
      contentLanguage={
        contentLanguageAttribute(card.sourceLanguage, locale).lang
      }
      subject={{
        label: card.object.displayName,
        href: card.object.publicPath,
        kindLabel: copy.kinds[card.object.kind],
        icon: KIND_ICONS[card.object.kind],
        // `undefined`, not an empty fragment: a fragment is truthy, and the
        // card drew its separator with nothing after it.
        meta: card.safeRegionCode ? (
          <>
            <MapPin aria-hidden="true" className="size-4" />
            {`${copy.safeRegion} ${card.safeRegionCode}`}
          </>
        ) : undefined,
      }}
      dateTime={dates.dateTime}
      dateLabel={`${dates.dateLabel} · ${copy.seasons[card.season]}`}
      published={dates.published}
      excerpt={card.excerpt}
      readMoreLabel={
        card.excerptTruncated ? getEntryCardCopy(locale).readMore : undefined
      }
      media={entryCardMedia(card.media)}
      author={
        card.author
          ? {
              displayName: card.author.displayName,
              href: card.author.profilePath,
              avatarUrl: card.author.avatarUrl,
            }
          : null
      }
      authorPrefix={copy.publishedBy}
      topics={card.topics.map((topic) => ({
        label: localizeTopicLabel(locale, topic.slug, topic.label),
        href: buildPublicJournalDirectoryHref(locale, {
          ...request,
          topic: topic.slug,
          page: 1,
        }),
      }))}
      engagement={
        <>
          {card.object.catalogPath ? (
            <Link
              href={card.object.catalogPath}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              {card.object.identityLabel}
            </Link>
          ) : (
            <span className="text-caption text-text-muted">
              {card.object.identityLabel ?? copy.identityPending}
            </span>
          )}
          <Link
            href={`${card.publicPath}#comments`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <MessageCircle aria-hidden="true" />
            {copy.discuss}
          </Link>
        </>
      }
      priority={priority}
    />
  );
}

function DirectoryLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="grid gap-4"
    >
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="grid gap-3 rounded-lg border border-border p-4 sm:p-5"
        >
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * Nothing matched.
 *
 * `empty-no-results` and never `empty-first-run`: this page is reached with a
 * search or a filter set, so what a reader needs is the filters they set and a
 * way to clear them — not a picture (DESIGN.md §5.4). The one case that is a
 * genuine first run is a directory with no filters at all and still nothing in
 * it, which means the product has no public entries yet.
 */
function DirectoryEmpty({
  locale,
  copy,
  chrome,
  filters,
  listingPath,
  clearFiltersHref,
}: {
  locale: PublicLocale;
  copy: PublicJournalDirectoryCopy;
  chrome: ReturnType<typeof getFilterBarChromeCopy>;
  filters: ReturnType<typeof buildActiveFilters>;
  listingPath: string;
  /** Null when no secondary filter is on, and only the search narrowed it. */
  clearFiltersHref: string | null;
}) {
  if (filters.length === 0) {
    return (
      <EmptyState
        illustration={resolveIllustration("empty-journal")}
        title={copy.firstRunTitle}
        description={copy.firstRunBody}
        action={
          <Link
            href={localizedPath(locale, "/guides/start-a-living-plant-record")}
            className={buttonVariants({})}
          >
            {copy.firstRunAction}
          </Link>
        }
      />
    );
  }

  return (
    <EmptyState
      variant="no-results"
      title={copy.emptyTitle}
      description={copy.emptyBody}
      filters={filters.map((filter) => (
        <Chip key={filter.key} label={filter.label} />
      ))}
      action={
        /* Clearing the filters keeps the words the reader typed: erasing a
           query they did not ask to erase is how a search gets retyped. Only
           a search with no filters offers to start over (OVE-482). */
        clearFiltersHref ? (
          <Link
            href={clearFiltersHref}
            className={buttonVariants({ variant: "secondary" })}
          >
            {chrome.clearFilters}
          </Link>
        ) : (
          <Link
            href={listingPath}
            className={buttonVariants({ variant: "secondary" })}
          >
            {copy.resetFilters}
          </Link>
        )
      }
    />
  );
}

function clearSecondaryFilters(
  request: PublicJournalDirectoryRequest,
): PublicJournalDirectoryRequest {
  return {
    ...request,
    catalog: null,
    topic: null,
    season: "all",
    region: null,
    page: 1,
  };
}

export function buildPublicJournalDirectoryContextModules(
  locale: PublicLocale,
  copy: PublicJournalDirectoryCopy,
  facets: PublicJournalDirectoryFacets,
): SiteShellContextRailModule[] {
  // A module with nothing in it is a heading with nothing under it, which is
  // the row of zeros in another shape (`OVE-447` criterion 5).
  return [
    {
      key: "journal-topics",
      title: copy.contextTopicsTitle,
      items: facets.topics
        .filter((topic) => !isKindTopicSlug(topic.slug))
        .slice(0, 6)
        .map((topic) => ({
          href: buildPublicJournalDirectoryHref(locale, {
            ...defaultRequest(),
            topic: topic.slug,
          }),
          label: localizeTopicLabel(locale, topic.slug, topic.label),
          meta: String(topic.count),
        })),
    },
    {
      key: "journal-catalogs",
      title: copy.contextCatalogsTitle,
      items: facets.catalogs.slice(0, 6).map((catalog) => ({
        href: buildPublicJournalDirectoryHref(locale, {
          ...defaultRequest(),
          catalog: catalog.slug,
        }),
        label: catalog.label,
        meta: String(catalog.count),
      })),
    },
  ].filter((module) => module.items.length > 0);
}

function buildActiveFilters(
  copy: PublicJournalDirectoryCopy,
  request: PublicJournalDirectoryRequest,
  facets: PublicJournalDirectoryFacets,
  locale: PublicLocale,
) {
  const filters: Array<{
    key: string;
    label: string;
    request: PublicJournalDirectoryRequest;
  }> = [];
  const resetPage = { ...request, page: 1 };
  if (request.query) {
    filters.push({
      key: "query",
      label: `“${request.query}”`,
      request: { ...resetPage, query: "" },
    });
  }
  if (request.kind !== "all") {
    filters.push({
      key: "kind",
      label: copy.kinds[request.kind],
      request: { ...resetPage, kind: "all" },
    });
  }
  if (request.catalog) {
    filters.push({
      key: "catalog",
      label:
        facets.catalogs.find((item) => item.slug === request.catalog)?.label ??
        request.catalog,
      request: { ...resetPage, catalog: null },
    });
  }
  if (request.topic) {
    const facet = facets.topics.find((item) => item.slug === request.topic);
    filters.push({
      key: "topic",
      label: facet
        ? localizeTopicLabel(locale, facet.slug, facet.label)
        : request.topic,
      request: { ...resetPage, topic: null },
    });
  }
  if (request.season !== "all") {
    filters.push({
      key: "season",
      label: copy.seasons[request.season],
      request: { ...resetPage, season: "all" },
    });
  }
  if (request.region) {
    filters.push({
      key: "region",
      label: request.region,
      request: { ...resetPage, region: null },
    });
  }
  const defaultSort = request.query ? "relevance" : "recent";
  if (request.sort !== defaultSort) {
    filters.push({
      key: "sort",
      label: copy.sorts[request.sort],
      request: { ...resetPage, sort: defaultSort },
    });
  }
  return filters;
}

function defaultRequest(): PublicJournalDirectoryRequest {
  return {
    query: "",
    kind: "all",
    catalog: null,
    topic: null,
    season: "all",
    region: null,
    sort: "recent",
    page: 1,
  };
}

function addDirectoryReturnTo(publicPath: string, directoryHref: string) {
  const params = new URLSearchParams({ from: directoryHref });
  return `${publicPath}?${params.toString()}`;
}

function formatPageLabel(
  label: string,
  page: number,
  totalPages: number,
  locale: PublicLocale,
) {
  const joiner = { uk: "з", bg: "от", ru: "из" }[locale];
  return `${label} ${page} ${joiner} ${totalPages}`;
}
