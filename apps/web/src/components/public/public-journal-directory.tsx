import Link from "next/link";
import { MapPin, MessageCircle, PawPrint, Search, Sprout } from "lucide-react";

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
import { resolveIllustration } from "@/lib/illustrations";
import { buildPublicMediaSourceSet } from "@/lib/media/derivative-keys";
import { buildPublicJournalDirectoryHref } from "@/lib/public-journal-directory-navigation";
import type { PublicJournalDirectoryCopy } from "@/lib/public-journal-directory-copy";
import {
  contentLanguageAttribute,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { publicMediaAltText } from "@/lib/public-media-alt";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { localizeTopicLabel } from "@/lib/system-topic-labels";
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
 * Six `<select>`s stacked above the results behind an "Застосувати" button
 * became a `FilterBar`: filters apply on change, the active ones sit above the
 * results as removable chips, the count is always visible and announced once
 * per settled change, sort is its own right-aligned control, and below `lg` it
 * all collapses into one button opening a sheet (DESIGN.md §5.1).
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
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);
  const listingPath = localizedPath(locale, "/journals");
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
        action={listingPath}
        /* The search field and its own submit. The submit is not an "Apply
           filters" button — the facets apply on change (DESIGN.md §5.1) — it
           is the search control's own action, the shape Etsy and Tripadvisor
           both ship. It is also the **real submit** criterion 7 asks the form
           to keep: pressing it sends the facets with the query, which is what
           makes this page filter for a crawler and for a reader whose bundle
           never arrived. */
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
        facets={buildFilterFacets(copy, page.request, facets, locale)}
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
        labels={{
          filters: copy.filtersLabel,
          openFilters: copy.filtersWithCount(activeFilters.length),
          sheetDescription: copy.filterSheetDescription,
          apply: copy.applyFilters,
          clear: copy.resetFilters,
          clearAll: copy.resetFilters,
          activeFilters: copy.activeFiltersLabel,
          sort: copy.sortLabel,
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
          filters={activeFilters}
          listingPath={listingPath}
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
                  priority={index === 0}
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
      key: "kind",
      label: copy.kindLabel,
      anyLabel: copy.kinds.all,
      value: request.kind === "all" ? [] : [request.kind],
      options: [
        { value: "plant", label: copy.kinds.plant },
        { value: "animal", label: copy.kinds.animal },
      ],
    },
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
      options: facets.topics.map((topic) => ({
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
  const [cover] = card.media;
  const sourceSet = cover ? buildPublicMediaSourceSet(cover) : null;

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
            <MapPin aria-hidden="true" className="size-3.5" />
            {copy.safeRegion} {card.safeRegionCode}
          </>
        ) : undefined,
      }}
      dateTime={toIsoDate(card.entryDate)}
      dateLabel={`${formatDate(card.entryDate, locale)} · ${copy.seasons[card.season]}`}
      excerpt={card.excerpt}
      cover={
        cover && sourceSet
          ? {
              src: sourceSet.src,
              srcSet: sourceSet.srcSet,
              alt: publicMediaAltText({}, card.title),
              placeholderDataUri: cover.placeholderDataUri,
              focalX: cover.focalX,
              focalY: cover.focalY,
              intrinsicWidth: cover.intrinsicWidth,
              intrinsicHeight: cover.intrinsicHeight,
            }
          : null
      }
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
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="aspect-card w-full" />
          <Skeleton className="h-4 w-44" />
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
  filters,
  listingPath,
}: {
  locale: PublicLocale;
  copy: PublicJournalDirectoryCopy;
  filters: ReturnType<typeof buildActiveFilters>;
  listingPath: string;
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
        <Link
          href={listingPath}
          className={buttonVariants({ variant: "secondary" })}
        >
          {copy.resetFilters}
        </Link>
      }
    />
  );
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
      items: facets.topics.slice(0, 6).map((topic) => ({
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

function formatDate(value: Date | string, locale: PublicLocale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
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

function localeTag(locale: PublicLocale) {
  return { uk: "uk-UA", bg: "bg-BG", ru: "ru-RU" }[locale];
}

function toIsoDate(value: Date | string) {
  return new Date(value).toISOString();
}
