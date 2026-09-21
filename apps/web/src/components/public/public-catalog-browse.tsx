import { MagnifyingGlassIcon as Search } from "@/components/icons/MagnifyingGlass";
import { PlantIcon as Sprout } from "@/components/icons/Plant";

import {
  SiteShellContextRailModules,
  SiteShellContextRailRegistration,
  type SiteShellContextRailModule,
} from "@/components/site-shell/site-shell-context-rail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { FilterBar, type FilterBarFacet } from "@/components/ui/filter-bar";
import { Link } from "@/components/ui/link";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildCatalogBrowseRemovalHref,
  buildPublicCatalogBrowseHref,
  catalogBrowseBasePath,
  catalogKingdomSlug,
  CATALOG_BROWSE_INITIALS,
  CATALOG_BROWSE_KINGDOMS,
  CATALOG_BROWSE_RANKS,
  CATALOG_BROWSE_REGISTERS,
  CATALOG_BROWSE_DEFAULT_SORT,
  CATALOG_BROWSE_SORTS,
  type PublicCatalogBrowseRequest,
} from "@/lib/public-catalog-browse";
import type { PublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import { publicCatalogRegisterHubPath } from "@/lib/catalog/addresses";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import { cn } from "@/lib/utils";
import type { WorkspaceFailureDescription } from "@/server/workspace-failure";
import type {
  CatalogBrowseCard,
  CatalogBrowseFacetCounts,
  CatalogBrowsePage,
} from "@/server/public-catalog-browse-repository";

/**
 * The catalogue's one door (`OVE-451`).
 *
 * It replaces five: `/objects` listed the living objects gardeners keep,
 * `/species` listed the organisms behind them, and a reader could arrive at
 * either without learning they were the same graph. There is one listing now,
 * one result card and one set of facets, and both old addresses `308` here.
 *
 * Three things it keeps from the door it replaces, and each is load-bearing:
 *
 * 1. **Every navigation is an `<a href>` rendered on the server.** This is the
 *    crawl path into 114 669 organism pages, and a link that needs hydration
 *    is not a crawl path (ADR-0024). The facets are a real `method="get"`
 *    form with a real submit; applying on change is the layer above it.
 * 2. **The alphabet index stays a list of links**, not a strip of buttons, so
 *    it is walkable by keyboard and by crawler alike.
 * 3. **Listing an organism confers nothing.** A source-only node stays
 *    `noindex` until a gardener publishes on it (ADR-0026 D9); the card says
 *    which ones have been written about, and that is all it does.
 */

export type PublicCatalogBrowseState = "ready" | "empty" | "loading" | "error";

export function PublicCatalogBrowse({
  locale,
  copy,
  request,
  page,
  facets,
  kingdomTotals,
  registerHubs,
  state,
  failure = null,
  jsonLd,
}: {
  locale: PublicLocale;
  copy: PublicCatalogBrowseCopy;
  request: PublicCatalogBrowseRequest;
  page: CatalogBrowsePage;
  facets: CatalogBrowseFacetCounts;
  /** The whole graph's shape, for the rail. Independent of the filters. */
  kingdomTotals: Readonly<Partial<Record<string, number>>>;
  registerHubs?: readonly { slug: string; name: string; total: number }[];
  state: PublicCatalogBrowseState;
  failure?: WorkspaceFailureDescription | null;
  jsonLd?: Record<string, unknown> | null;
}) {
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);
  const listingPath = catalogBrowseBasePath(locale);
  const chips = buildActiveFilterChips(locale, copy, request);
  const countLabel =
    state === "ready" || state === "empty" ? copy.resultCount(page.total) : "";
  const contextModules = buildPublicCatalogContextModules(
    locale,
    copy,
    kingdomTotals,
    registerHubs,
  );

  return (
    <main
      lang={locale}
      data-public-catalog-browse="true"
      data-public-catalog-state={state}
      data-catalog-browse-kingdom={
        request.kingdoms.length === 1
          ? catalogKingdomSlug(request.kingdoms[0]!)
          : "all"
      }
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}
      <SiteShellContextRailRegistration modules={contextModules} />

      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />

      <FilterBar
        action={listingPath}
        search={
          <div className="flex items-end gap-2">
            <Field
              label={copy.searchLabel}
              id="catalog-search"
              className="min-w-0 flex-1"
            >
              <SearchInput
                name="q"
                defaultValue={request.query}
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
        facets={buildFilterFacets(locale, copy, request, facets)}
        sort={{
          key: "sort",
          value: request.sort,
          defaultValue: CATALOG_BROWSE_DEFAULT_SORT,
          options: CATALOG_BROWSE_SORTS.map((value) => ({
            value,
            label: copy.sorts[value],
          })),
        }}
        chips={chips}
        clearAllHref={listingPath}
        /* The letter is a facet of the same listing, so it travels with the
           form rather than being dropped the moment a reader changes a
           select — the defect the journals directory shipped once. */
        hidden={request.initial ? { letter: request.initial } : {}}
        labels={{
          filters: copy.filtersLabel,
          openFilters: copy.filtersWithCount(chips.length),
          sheetDescription: copy.filterSheetDescription,
          apply: copy.applyFilters,
          clear: copy.resetFilters,
          clearAll: copy.resetFilters,
          activeFilters: copy.activeFiltersLabel,
          sort: copy.sortLabel,
        }}
      />

      <CatalogAlphabetIndex
        locale={locale}
        copy={copy}
        request={request}
        facets={facets}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
        <h2 className="text-h2 text-text-heading">{copy.resultsTitle}</h2>
        {/* Always rendered, so the node survives a filter change and the new
            number is announced *into* it. */}
        <p
          data-catalog-result-count="true"
          aria-live="polite"
          className="text-body-sm text-text-muted tabular-nums"
        >
          {countLabel}
        </p>
      </div>

      {state === "loading" ? (
        <ul className="grid list-none gap-3" aria-label={copy.loadingLabel}>
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index}>
              <Skeleton className="h-20 w-full rounded-lg" />
            </li>
          ))}
        </ul>
      ) : null}

      {state === "error" ? (
        <ErrorState
          failureClass={failure?.failureClass ?? "unknown"}
          digest={failure?.digest ?? "0000000"}
          title={copy.errorTitle}
          description={copy.errorBody}
          reference={`${copy.errorReference} ${failure?.digest ?? "0000000"}`}
          retryHref={buildPublicCatalogBrowseHref(locale, request)}
          retryLabel={copy.retry}
        />
      ) : null}

      {state === "empty" ? (
        <EmptyState
          variant="no-results"
          illustration={null}
          title={copy.emptyTitle}
          description={copy.emptyBody}
          action={
            chips.length > 0 ? (
              <Link href={listingPath}>{copy.resetFilters}</Link>
            ) : null
          }
        />
      ) : null}

      {state === "ready" ? (
        <>
          <ul className="grid list-none">
            {page.cards.map((card) => (
              <CatalogResultRow
                key={card.id}
                card={card}
                locale={locale}
                copy={copy}
              />
            ))}
          </ul>
          <Pagination
            label={copy.resultsTitle}
            previousHref={
              request.page > 1
                ? buildPublicCatalogBrowseHref(locale, {
                    ...request,
                    page: request.page - 1,
                  })
                : null
            }
            previousLabel={copy.previousPage}
            nextHref={
              request.page < page.pageCount
                ? buildPublicCatalogBrowseHref(locale, {
                    ...request,
                    page: request.page + 1,
                  })
                : null
            }
            nextLabel={copy.nextPage}
            status={copy.pageOf(request.page, page.pageCount)}
          />
        </>
      ) : null}

      {registerHubs && registerHubs.length > 0 ? (
        // The register hubs (OVE-433) are the substantive pages in the
        // catalogue — an aggregation over cards that are `noindex` on their
        // own (ADR-0026 D9) — so the one door links them.
        <Section
          id="catalog-registers"
          level={2}
          title={copy.registersHeading}
          headingClassName="text-h3"
        >
          <ul className="flex list-none flex-wrap gap-2">
            {registerHubs.map((hub) => (
              <li key={hub.slug}>
                <Link
                  href={localizedPath(
                    locale,
                    publicCatalogRegisterHubPath(hub.slug),
                  )}
                  variant="quiet"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-body-sm"
                >
                  {hub.name}
                  <span className="text-caption text-text-muted tabular-nums">
                    {hub.total}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Every screen is complete without the rail (DESIGN.md §3.2). The
          kingdoms are the one thing the rail offers that nothing above does:
          the filter bar narrows the view a reader is *in*, so from "grown
          here" its plants link keeps that filter, and the whole kingdom was
          reachable only at `xl`. The registers are already a section of their
          own, so they are not repeated. Found on 2026-09-20 by
          `tests/site-shell.spec.ts`, which had been in no CI list. */}
      <div className="border-t border-border pt-6 xl:hidden">
        <SiteShellContextRailModules
          modules={contextModules.filter(
            (module) => module.key === "catalog-kingdoms",
          )}
        />
      </div>
    </main>
  );
}

/**
 * One organism, as the catalogue shows it.
 *
 * The accepted name, the reader's own name for it, what rank it is, which
 * registers hold it, and whether a gardener here has written about it — the
 * five facts `OVE-451` asks for, in one component used by every view.
 *
 * **A row, not a card.** A page is sixty of these, and sixty bordered boxes
 * for sixty one-line names is a page a reader has to scroll past rather than
 * scan; DESIGN.md §4.1 has it plainly — a list of things is a list. The card
 * shape belongs to an entry, which carries a photograph and a paragraph.
 *
 * The accepted name carries `lang="la"` when the rank makes it a binomial: a
 * screen reader that reads *Solanum lycopersicum* with Ukrainian phonetics
 * reads a different word (WCAG 3.1.2). A cultivar denomination is a name
 * somebody chose, in whatever language they chose it, so it does not.
 */
function CatalogResultRow({
  card,
  locale,
  copy,
}: {
  card: CatalogBrowseCard;
  locale: PublicLocale;
  copy: PublicCatalogBrowseCopy;
}) {
  const scientific = card.rank === "species" || card.rank === "subspecies";

  return (
    <ListRow
      data-catalog-card={card.id}
      href={localizedPath(locale, card.path)}
      title={
        scientific ? (
          <span lang="la" className="italic">
            {card.name}
          </span>
        ) : (
          card.name
        )
      }
      description={
        card.vernacularName && card.vernacularName !== card.name
          ? card.vernacularName
          : null
      }
      meta={
        <span className="flex flex-wrap items-center gap-2">
          {card.rank && isKnownRank(card.rank) ? (
            <Badge tone="neutral">{copy.rank[card.rank]}</Badge>
          ) : null}
          {card.registers.map((register) => (
            <Badge key={register} tone="info">
              {copy.register[register]}
            </Badge>
          ))}
          {card.hasFirstHandContent ? (
            <Badge tone="success">
              <Sprout aria-hidden="true" />
              {copy.writtenAbout}
            </Badge>
          ) : null}
        </span>
      }
    />
  );
}

function isKnownRank(
  rank: string,
): rank is (typeof CATALOG_BROWSE_RANKS)[number] {
  return (CATALOG_BROWSE_RANKS as readonly string[]).includes(rank);
}

/**
 * The alphabet, as links.
 *
 * A letter is a facet of the listing like any other, so it is in the URL and
 * it composes with the rest — `?kingdom=fungi&letter=a` is a real view. It is
 * a list of anchors rather than a row of buttons because a crawler walks it
 * and because 27 buttons in a toolbar is 27 tab stops.
 */
function CatalogAlphabetIndex({
  locale,
  copy,
  request,
  facets,
}: {
  locale: PublicLocale;
  copy: PublicCatalogBrowseCopy;
  request: PublicCatalogBrowseRequest;
  facets: CatalogBrowseFacetCounts;
}) {
  return (
    <nav aria-label={copy.lettersHeading} className="min-w-0">
      <ul className="flex list-none flex-wrap gap-1">
        <li>
          <Link
            href={buildPublicCatalogBrowseHref(locale, {
              ...request,
              initial: null,
              page: 1,
            })}
            variant="quiet"
            aria-current={request.initial === null ? "true" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md px-3 text-body-sm",
              request.initial === null
                ? "bg-surface-sunken font-semibold text-text"
                : "text-text-muted",
            )}
          >
            {copy.allLetters}
          </Link>
        </li>
        {CATALOG_BROWSE_INITIALS.map((initial) => {
          const total = facets.initials[initial] ?? 0;
          const active = request.initial === initial;
          if (total === 0 && !active) {
            return (
              <li key={initial}>
                <span
                  aria-disabled="true"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-body-sm text-text-disabled uppercase"
                >
                  {initial}
                </span>
              </li>
            );
          }
          return (
            <li key={initial}>
              <Link
                href={buildPublicCatalogBrowseHref(locale, {
                  ...request,
                  initial,
                  page: 1,
                })}
                variant="quiet"
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-body-sm uppercase",
                  active
                    ? "bg-surface-sunken font-semibold text-text"
                    : "text-text",
                )}
              >
                {initial}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function buildFilterFacets(
  locale: PublicLocale,
  copy: PublicCatalogBrowseCopy,
  request: PublicCatalogBrowseRequest,
  facets: CatalogBrowseFacetCounts,
): FilterBarFacet[] {
  // A six-figure count with no grouping is unreadable, and the catalogue is
  // all six-figure counts. The bar formats nothing, so the number arrives in
  // the reader's own language from here (DESIGN.md §4.2.5).
  const format = (total: number) => total.toLocaleString(locale);
  return [
    {
      key: "kingdom",
      label: copy.kingdomFacet,
      value: request.kingdoms.map(catalogKingdomSlug),
      anyLabel: copy.anyKingdom,
      options: CATALOG_BROWSE_KINGDOMS.filter(
        (kingdom) =>
          (facets.kingdoms[kingdom] ?? 0) > 0 ||
          request.kingdoms.includes(kingdom),
      ).map((kingdom) => ({
        value: catalogKingdomSlug(kingdom),
        label: copy.kingdom[kingdom],
        count: facets.kingdoms[kingdom] ?? 0,
        countLabel: format(facets.kingdoms[kingdom] ?? 0),
      })),
    },
    {
      key: "rank",
      label: copy.rankFacet,
      value: [...request.ranks],
      anyLabel: copy.anyRank,
      options: CATALOG_BROWSE_RANKS.filter(
        (rank) => (facets.ranks[rank] ?? 0) > 0 || request.ranks.includes(rank),
      ).map((rank) => ({
        value: rank,
        label: copy.rank[rank],
        count: facets.ranks[rank] ?? 0,
        countLabel: format(facets.ranks[rank] ?? 0),
      })),
    },
    {
      key: "register",
      label: copy.registerFacet,
      value: [...request.registers],
      anyLabel: copy.anyRegister,
      options: CATALOG_BROWSE_REGISTERS.map((register) => ({
        value: register,
        label: copy.register[register],
        count: facets.registers[register],
        countLabel: format(facets.registers[register]),
      })),
    },
    {
      key: "grown",
      label: copy.grownFacet,
      value: request.grown ? ["1"] : [],
      anyLabel: copy.grownAny,
      options: [
        {
          value: "1",
          label: copy.grownOnly,
          count: facets.grown,
          countLabel: format(facets.grown),
        },
      ],
    },
  ];
}

function buildActiveFilterChips(
  locale: PublicLocale,
  copy: PublicCatalogBrowseCopy,
  request: PublicCatalogBrowseRequest,
) {
  const chips: {
    key: string;
    label: string;
    removeHref: string;
    removeLabel: string;
  }[] = [];
  const add = (
    key: string,
    label: string,
    facet: Parameters<typeof buildCatalogBrowseRemovalHref>[2],
    value?: string,
  ) => {
    chips.push({
      key,
      label,
      removeHref: buildCatalogBrowseRemovalHref(locale, request, facet, value),
      removeLabel: `${copy.removeFilter}: ${label}`,
    });
  };

  if (request.query) add("q", request.query, "q");
  for (const kingdom of request.kingdoms) {
    add(`kingdom:${kingdom}`, copy.kingdom[kingdom], "kingdom", kingdom);
  }
  for (const rank of request.ranks) {
    add(`rank:${rank}`, copy.rank[rank], "rank", rank);
  }
  for (const register of request.registers) {
    add(`register:${register}`, copy.register[register], "register", register);
  }
  if (request.grown) add("grown", copy.grownOnly, "grown");
  if (request.initial) {
    add(`letter:${request.initial}`, request.initial.toUpperCase(), "letter");
  }
  return chips;
}

export function buildPublicCatalogContextModules(
  locale: PublicLocale,
  copy: PublicCatalogBrowseCopy,
  kingdomTotals: Readonly<Partial<Record<string, number>>>,
  registerHubs?: readonly { slug: string; name: string; total: number }[],
): SiteShellContextRailModule[] {
  return [
    {
      key: "catalog-kingdoms",
      title: copy.kingdomsHeading,
      items: CATALOG_BROWSE_KINGDOMS.filter(
        (kingdom) => (kingdomTotals[kingdom] ?? 0) > 0,
      ).map((kingdom) => ({
        href: buildPublicCatalogBrowseHref(locale, { kingdoms: [kingdom] }),
        label: copy.kingdom[kingdom],
        meta: String(kingdomTotals[kingdom] ?? 0),
      })),
      emptyLabel: copy.emptyTitle,
    },
    {
      key: "catalog-registers",
      title: copy.registersHeading,
      items: (registerHubs ?? []).slice(0, 6).map((hub) => ({
        href: localizedPath(locale, publicCatalogRegisterHubPath(hub.slug)),
        label: hub.name,
        meta: String(hub.total),
      })),
      emptyLabel: copy.anyRegister,
    },
  ];
}
