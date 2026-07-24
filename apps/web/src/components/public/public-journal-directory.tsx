import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ImageOff,
  MapPin,
  PawPrint,
  Search,
  Sprout,
  UserRound,
  X,
} from "lucide-react";

import { SubjectAwareMediaImage } from "@/components/media/subject-aware-media-image";
import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildPublicJournalDirectoryHref } from "@/lib/public-journal-directory-navigation";
import type { PublicJournalDirectoryCopy } from "@/lib/public-journal-directory-copy";
import type { PublicLocale } from "@/lib/public-localization";
import { cn } from "@/lib/utils";
import type {
  PublicJournalDirectoryCard,
  PublicJournalDirectoryFacets,
  PublicJournalDirectoryPage,
  PublicJournalDirectoryRequest,
} from "@/server/public-journal-directory-repository";

export { buildPublicJournalDirectoryHref } from "@/lib/public-journal-directory-navigation";

export type PublicJournalDirectoryState =
  | "ready"
  | "empty"
  | "loading"
  | "error";

export function PublicJournalDirectory({
  locale,
  copy,
  page,
  facets,
  state,
  visualCorpus = false,
}: {
  locale: PublicLocale;
  copy: PublicJournalDirectoryCopy;
  page: PublicJournalDirectoryPage;
  facets: PublicJournalDirectoryFacets;
  state: PublicJournalDirectoryState;
  visualCorpus?: boolean;
}) {
  const contextModules = buildPublicJournalDirectoryContextModules(
    locale,
    copy,
    facets,
    visualCorpus,
  );
  const activeFilters = buildActiveFilters(copy, page.request, facets);
  const filterStateHref = buildPublicJournalDirectoryHref(
    locale,
    page.request,
    visualCorpus,
  );

  return (
    <main
      lang={locale}
      data-public-journal-directory="true"
      data-public-journal-directory-state={state}
      data-public-journal-search-source={page.searchSource}
      className="mx-auto flex w-full max-w-5xl flex-col px-4 py-4 sm:px-6 sm:py-5"
    >
      <SiteShellContextRailRegistration modules={contextModules} />

      <header className="grid gap-2 border-b border-border pb-4">
        <h1 className="text-3xl font-semibold text-foreground">
          {copy.heading}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.intro}
        </p>
      </header>

      <form
        key={filterStateHref}
        data-journal-filter-state={filterStateHref}
        method="get"
        action={buildPublicJournalDirectoryHref(
          locale,
          defaultRequest(),
          visualCorpus,
        )}
        aria-label={copy.filtersLabel}
        className="grid gap-4 border-b border-border py-4"
      >
        {visualCorpus ? (
          <input type="hidden" name="__visualJournals" value="corpus" />
        ) : null}
        <label className="grid gap-1.5 text-sm font-medium text-foreground">
          <span>{copy.searchLabel}</span>
          <span className="flex min-w-0 gap-2">
            <input
              type="search"
              name="q"
              defaultValue={page.request.query}
              maxLength={120}
              placeholder={copy.searchPlaceholder}
              className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              className={buttonVariants({ variant: "default" })}
            >
              <Search aria-hidden="true" />
              {copy.searchSubmit}
            </button>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FilterSelect
            label={copy.kindLabel}
            name="kind"
            value={page.request.kind === "all" ? "" : page.request.kind}
            options={[
              { value: "", label: copy.kinds.all },
              { value: "plant", label: copy.kinds.plant },
              { value: "animal", label: copy.kinds.animal },
            ]}
          />
          <FilterSelect
            label={copy.catalogLabel}
            name="catalog"
            value={page.request.catalog ?? ""}
            options={[
              { value: "", label: copy.allCatalogs },
              ...facets.catalogs.map((catalog) => ({
                value: catalog.slug,
                label: `${catalog.label} (${catalog.count})`,
              })),
            ]}
          />
          <FilterSelect
            label={copy.topicLabel}
            name="topic"
            value={page.request.topic ?? ""}
            options={[
              { value: "", label: copy.allTopics },
              ...facets.topics.map((topic) => ({
                value: topic.slug,
                label: `${topic.label} (${topic.count})`,
              })),
            ]}
          />
          <FilterSelect
            label={copy.seasonLabel}
            name="season"
            value={page.request.season === "all" ? "" : page.request.season}
            options={Object.entries(copy.seasons).map(([value, label]) => ({
              value: value === "all" ? "" : value,
              label,
            }))}
          />
          <FilterSelect
            label={copy.regionLabel}
            name="region"
            value={page.request.region ?? ""}
            options={[
              { value: "", label: copy.allRegions },
              ...facets.regions.map((region) => ({
                value: region.code,
                label: `${region.code} (${region.count})`,
              })),
            ]}
          />
          <FilterSelect
            label={copy.sortLabel}
            name="sort"
            value={page.request.sort}
            options={Object.entries(copy.sorts).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </div>

        <button
          type="submit"
          className={buttonVariants({
            variant: "outline",
            className: "w-fit",
          })}
        >
          {copy.applyFilters}
        </button>
      </form>

      {activeFilters.length > 0 ? (
        <nav
          aria-label={copy.activeFiltersLabel}
          className="flex flex-wrap items-center gap-2 border-b border-border py-3"
        >
          {activeFilters.map((filter) => (
            <Link
              key={filter.key}
              href={buildPublicJournalDirectoryHref(
                locale,
                filter.request,
                visualCorpus,
              )}
              aria-label={`${copy.removeFilter}: ${filter.label}`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <span className="max-w-56 truncate">{filter.label}</span>
              <X aria-hidden="true" />
            </Link>
          ))}
          <Link
            href={buildPublicJournalDirectoryHref(
              locale,
              defaultRequest(),
              visualCorpus,
            )}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {copy.resetFilters}
          </Link>
        </nav>
      ) : null}

      <section className="flex min-h-14 items-center justify-between gap-4 border-b border-border py-3">
        <h2 className="text-lg font-semibold text-foreground">
          {copy.resultsTitle}
        </h2>
        {state === "ready" || state === "empty" ? (
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatCount(page.totalCount, locale)}
          </span>
        ) : null}
      </section>

      {state === "loading" ? (
        <DirectoryLoading label={copy.loadingLabel} />
      ) : null}
      {state === "error" ? (
        <DirectoryError
          locale={locale}
          copy={copy}
          request={page.request}
          visualCorpus={visualCorpus}
        />
      ) : null}
      {state === "empty" ? (
        <DirectoryEmpty
          locale={locale}
          copy={copy}
          visualCorpus={visualCorpus}
        />
      ) : null}
      {state === "ready" ? (
        <>
          <ol className="grid gap-px overflow-hidden border-x border-b border-border bg-border">
            {page.cards.map((card) => (
              <li key={card.publicPath} className="min-w-0 bg-background">
                <JournalResult
                  locale={locale}
                  copy={copy}
                  request={page.request}
                  card={card}
                  visualCorpus={visualCorpus}
                />
              </li>
            ))}
          </ol>
          <DirectoryPagination
            locale={locale}
            copy={copy}
            page={page}
            visualCorpus={visualCorpus}
          />
        </>
      ) : null}

      <div className="mt-6 border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules modules={contextModules} />
      </div>
    </main>
  );
}

function FilterSelect({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((option) => (
          <option key={`${name}:${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function JournalResult({
  locale,
  copy,
  request,
  card,
  visualCorpus,
}: {
  locale: PublicLocale;
  copy: PublicJournalDirectoryCopy;
  request: PublicJournalDirectoryRequest;
  card: PublicJournalDirectoryCard;
  visualCorpus: boolean;
}) {
  const directoryHref = buildPublicJournalDirectoryHref(
    locale,
    request,
    visualCorpus,
  );
  const entryHref = addDirectoryReturnTo(card.publicPath, directoryHref);
  const KindIcon = {
    plant: Sprout,
    animal: PawPrint,
  }[card.object.kind];

  return (
    <article className="grid min-w-0 gap-4 p-4 md:grid-cols-5">
      <ResultMedia card={card} copy={copy} />

      <div className="flex min-w-0 flex-col gap-3 md:col-span-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <KindIcon className="size-3.5" aria-hidden="true" />
            {copy.kinds[card.object.kind]}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            <time dateTime={toIsoDate(card.entryDate)}>
              {formatDate(card.entryDate, locale)}
            </time>
            · {copy.seasons[card.season]}
          </span>
          {card.safeRegionCode ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" aria-hidden="true" />
              {copy.safeRegion} {card.safeRegionCode}
            </span>
          ) : null}
        </div>

        <div className="min-w-0">
          <Link href={entryHref} className="hover:text-primary">
            <h3 className="text-xl leading-7 font-semibold text-foreground">
              {card.title}
            </h3>
          </Link>
          <p className="mt-1 text-sm font-medium text-foreground">
            {card.object.displayName}
          </p>
          {card.object.catalogPath ? (
            <Link
              href={card.object.catalogPath}
              className="mt-1 inline-block text-xs text-primary hover:underline"
            >
              {card.object.identityLabel}
            </Link>
          ) : (
            <span className="mt-1 block text-xs text-muted-foreground">
              {card.object.identityLabel ?? copy.identityPending}
            </span>
          )}
        </div>

        <p className="line-clamp-4 text-sm leading-6 text-muted-foreground">
          {card.excerpt}
        </p>

        {card.topics.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {card.topics.map((topic) => (
              <Link
                key={topic.slug}
                href={buildPublicJournalDirectoryHref(
                  locale,
                  {
                    ...request,
                    topic: topic.slug,
                    page: 1,
                  },
                  visualCorpus,
                )}
                className="inline-flex min-h-6 items-center hover:text-primary hover:underline"
              >
                #{topic.label}
              </Link>
            ))}
          </div>
        ) : null}

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          {card.author ? (
            <Link
              href={card.author.profilePath}
              className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground hover:text-primary"
            >
              {card.author.avatarUrl ? (
                <Image
                  src={card.author.avatarUrl}
                  alt=""
                  width={28}
                  height={28}
                  className="size-7 rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                  <UserRound className="size-4" aria-hidden="true" />
                </span>
              )}
              <span className="truncate">
                {copy.publishedBy} {card.author.displayName}
              </span>
            </Link>
          ) : (
            <span />
          )}
          <Link
            href={entryHref}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {copy.readEntry}
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </article>
  );
}

function ResultMedia({
  card,
  copy,
}: {
  card: PublicJournalDirectoryCard;
  copy: PublicJournalDirectoryCopy;
}) {
  const media = card.media.slice(0, 3);

  return (
    <div
      data-journal-result-media-count={media.length}
      className={cn(
        "grid aspect-4/3 w-full shrink-0 overflow-hidden rounded-md border border-border bg-muted md:aspect-square",
        media.length === 2 && "grid-cols-2",
        media.length === 3 && "grid-cols-2 grid-rows-2",
      )}
    >
      {media.length === 0 ? (
        <div className="flex h-full items-center justify-center gap-2 p-3 text-center text-xs text-foreground">
          <ImageOff className="size-4" aria-hidden="true" />
          {copy.noPublicPhoto}
        </div>
      ) : null}
      {media.map((item, index) => (
        <div
          key={item.publicUrl}
          className={cn(
            "relative min-h-0 overflow-hidden",
            media.length === 3 && index === 0 && "row-span-2",
          )}
        >
          <SubjectAwareMediaImage
            src={item.publicUrl}
            alt={`${card.object.displayName}: ${card.title}`}
            fill
            sizes="(max-width: 767px) 100vw, 192px"
            presentationMode="cover"
            focalX={item.focalX}
            focalY={item.focalY}
            intrinsicWidth={item.intrinsicWidth}
            intrinsicHeight={item.intrinsicHeight}
            className="absolute inset-0 h-full w-full"
            unoptimized
          />
        </div>
      ))}
    </div>
  );
}

function DirectoryLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="grid gap-px bg-border"
    >
      {[0, 1, 2].map((item) => (
        <div key={item} className="grid gap-4 bg-background p-4 md:grid-cols-5">
          <Skeleton className="aspect-4/3 w-full md:aspect-square" />
          <div className="grid content-start gap-3 md:col-span-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-7 w-4/5" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DirectoryEmpty({
  locale,
  copy,
  visualCorpus,
}: {
  locale: PublicLocale;
  copy: PublicJournalDirectoryCopy;
  visualCorpus: boolean;
}) {
  return (
    <section className="flex flex-col items-start gap-3 py-10">
      <BookOpen aria-hidden="true" />
      <h2 className="text-xl font-semibold text-foreground">
        {copy.emptyTitle}
      </h2>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        {copy.emptyBody}
      </p>
      <Link
        href={buildPublicJournalDirectoryHref(
          locale,
          defaultRequest(),
          visualCorpus,
        )}
        className={buttonVariants({ variant: "outline" })}
      >
        {copy.resetFilters}
      </Link>
    </section>
  );
}

function DirectoryError({
  locale,
  copy,
  request,
  visualCorpus,
}: {
  locale: PublicLocale;
  copy: PublicJournalDirectoryCopy;
  request: PublicJournalDirectoryRequest;
  visualCorpus: boolean;
}) {
  return (
    <section role="alert" className="flex flex-col items-start gap-3 py-10">
      <h2 className="text-xl font-semibold text-foreground">
        {copy.errorTitle}
      </h2>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        {copy.errorBody}
      </p>
      <Link
        href={buildPublicJournalDirectoryHref(locale, request, visualCorpus)}
        className={buttonVariants({ variant: "outline" })}
      >
        {copy.retry}
      </Link>
    </section>
  );
}

function DirectoryPagination({
  locale,
  copy,
  page,
  visualCorpus,
}: {
  locale: PublicLocale;
  copy: PublicJournalDirectoryCopy;
  page: PublicJournalDirectoryPage;
  visualCorpus: boolean;
}) {
  return (
    <footer className="grid min-h-16 grid-cols-3 items-center gap-2 border-t border-border py-4">
      <div>
        {page.hasPreviousPage ? (
          <Link
            href={buildPublicJournalDirectoryHref(
              locale,
              {
                ...page.request,
                page: Math.max(1, page.request.page - 1),
              },
              visualCorpus,
            )}
            aria-label={copy.previousPage}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeft aria-hidden="true" />
            <span className="hidden sm:inline">{copy.previousPage}</span>
          </Link>
        ) : null}
      </div>
      <p className="text-center text-xs text-muted-foreground tabular-nums">
        {formatPageLabel(
          copy.pageLabel,
          page.request.page,
          page.totalPages,
          locale,
        )}
      </p>
      <div className="flex justify-end">
        {page.hasNextPage ? (
          <Link
            href={buildPublicJournalDirectoryHref(
              locale,
              {
                ...page.request,
                page: page.request.page + 1,
              },
              visualCorpus,
            )}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {copy.loadMore}
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        ) : (
          <span className="text-right text-xs text-muted-foreground">
            {copy.endOfResults}
          </span>
        )}
      </div>
    </footer>
  );
}

export function buildPublicJournalDirectoryContextModules(
  locale: PublicLocale,
  copy: PublicJournalDirectoryCopy,
  facets: PublicJournalDirectoryFacets,
  visualCorpus = false,
): SiteShellContextRailModule[] {
  return [
    {
      key: "journal-topics",
      title: copy.contextTopicsTitle,
      items: facets.topics.slice(0, 6).map((topic) => ({
        href: buildPublicJournalDirectoryHref(
          locale,
          {
            ...defaultRequest(),
            topic: topic.slug,
          },
          visualCorpus,
        ),
        label: topic.label,
        meta: String(topic.count),
      })),
    },
    {
      key: "journal-catalogs",
      title: copy.contextCatalogsTitle,
      items: facets.catalogs.slice(0, 6).map((catalog) => ({
        href: buildPublicJournalDirectoryHref(
          locale,
          {
            ...defaultRequest(),
            catalog: catalog.slug,
          },
          visualCorpus,
        ),
        label: catalog.label,
        meta: String(catalog.count),
      })),
    },
  ];
}

function buildActiveFilters(
  copy: PublicJournalDirectoryCopy,
  request: PublicJournalDirectoryRequest,
  facets: PublicJournalDirectoryFacets,
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
    filters.push({
      key: "topic",
      label:
        facets.topics.find((item) => item.slug === request.topic)?.label ??
        request.topic,
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

function formatCount(value: number, locale: PublicLocale) {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
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
