import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";

import {
  PublicCatalogBrowse,
  type PublicCatalogBrowseState,
} from "@/components/public/public-catalog-browse";
import {
  buildPublicCatalogBrowseHref,
  isUnfilteredCatalogBrowseRequest,
  normalizePublicCatalogBrowseRequest,
  type PublicCatalogBrowseRequest,
} from "@/lib/public-catalog-browse";
import { getPublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import {
  isPublicLocale,
  PREFIXED_PUBLIC_LOCALES,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  readCatalogBrowseFacets,
  readCatalogBrowseKingdoms,
  readCatalogBrowsePage,
  readCatalogRegisterHubSpecies,
} from "@/server/public-cache";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import type {
  CatalogBrowseFacetCounts,
  CatalogBrowseKingdomSummary,
  CatalogBrowsePage,
} from "@/server/public-catalog-browse-repository";

type SearchParams = Record<string, string | string[] | undefined>;

type RegisterHubSpecies = { slug: string; name: string; total: number };

interface PublicCatalogRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<SearchParams>;
}

/**
 * The catalogue's one door (`OVE-451`).
 *
 * `/species` answered a real 404 until `OVE-431` gave it an index, and then
 * the product had two indexes over one graph — this one and `/objects` — plus
 * three address families under them. There is one listing here now, and both
 * old addresses `308` to the view they meant.
 *
 * The canonical is this address with no query in **every** view: a kingdom, a
 * letter, a register and a search are filters over one listing, not addresses
 * of their own (ADR-0029 D10), and the proxy stamps `noindex, follow` on any
 * page past the first — so the filtered views are crawled for their links and
 * never compete with the root.
 */

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

/**
 * The catalogue is read at request time, and a read that failed is an empty
 * catalogue rather than a broken page.
 *
 * `connection()` first: it marks the scope as needing a request, so the build
 * never reaches the database. Without it `next build` runs these queries, and
 * a preview deployment — which has no `DATABASE_URL` at all — fails outright.
 * `Promise.allSettled` alone does not save it; the prerender aborts on the
 * rejection however it is handled.
 */
async function settled<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  // A thunk, not a promise: an argument is evaluated before the call, so
  // passing `read()` starts the query before `connection()` can postpone it.
  await connection();
  const [result] = await Promise.allSettled([work()]);
  return result.status === "fulfilled" ? result.value : fallback;
}

export async function generateMetadata({
  params,
}: PublicCatalogRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery("localized_catalog_browse")
        .decision.robots,
    };
  }
  const kingdoms = await settled<CatalogBrowseKingdomSummary[]>(
    readCatalogBrowseKingdoms,
    [],
  );
  return buildCatalogSurface(localeParam, kingdoms).metadata;
}

export async function renderPublicCatalogPage(
  locale: PublicLocale,
  searchParams: SearchParams = {},
) {
  const request = normalizePublicCatalogBrowseRequest(searchParams);
  const unfiltered = isUnfilteredCatalogBrowseRequest(request);
  const [kingdoms, registerHubs, page, facets] = await Promise.all([
    settled<CatalogBrowseKingdomSummary[]>(readCatalogBrowseKingdoms, []),
    // The register hubs are the catalogue's own substantive pages, and they
    // belong on the door rather than inside one of its filtered views.
    unfiltered
      ? settled<RegisterHubSpecies[]>(
          async () => [...(await readCatalogRegisterHubSpecies())].slice(0, 24),
          [],
        )
      : Promise.resolve<RegisterHubSpecies[]>([]),
    settled<CatalogBrowsePage | null>(
      () => readCatalogBrowsePage(request, locale),
      null,
    ),
    settled<CatalogBrowseFacetCounts | null>(
      () => readCatalogBrowseFacets(request),
      null,
    ),
  ]);

  // Past the last page is not a page (ADR-0029 D3).
  if (page && request.page > page.pageCount && request.page > 1) notFound();

  const state: PublicCatalogBrowseState =
    page === null || facets === null
      ? "error"
      : page.cards.length === 0
        ? "empty"
        : "ready";
  const surface = buildCatalogSurface(locale, kingdoms, request, page);

  return (
    <PublicCatalogBrowse
      locale={locale}
      copy={getPublicCatalogBrowseCopy(locale)}
      request={request}
      page={page ?? { cards: [], total: 0, pageCount: 1 }}
      facets={facets ?? EMPTY_FACETS}
      kingdomTotals={Object.fromEntries(
        kingdoms.map((summary) => [summary.kingdom, summary.total]),
      )}
      registerHubs={registerHubs}
      state={state}
      jsonLd={surface.jsonLd}
    />
  );
}

const EMPTY_FACETS: CatalogBrowseFacetCounts = {
  kingdoms: {},
  ranks: {},
  registers: { ua: 0, eu: 0 },
  grown: 0,
  initials: {},
  total: 0,
};

export default async function PublicCatalogRoute({
  params,
  searchParams,
}: PublicCatalogRouteProps) {
  const [{ locale: localeParam }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as SearchParams),
  ]);
  if (!isPublicLocale(localeParam)) notFound();
  return renderPublicCatalogPage(localeParam, query);
}

function buildCatalogSurface(
  locale: PublicLocale,
  kingdoms: readonly CatalogBrowseKingdomSummary[],
  request: PublicCatalogBrowseRequest = normalizePublicCatalogBrowseRequest(),
  page: CatalogBrowsePage | null = null,
) {
  const copy = getPublicCatalogBrowseCopy(locale);
  // What the page actually lists, which is not the same thing in every view:
  // an empty listing is `noindex` (ADR-0022 D3), and describing the root's
  // kingdoms here in every case would have told the rule that a letter nobody
  // has filed anything under is full.
  const listed = page
    ? {
        text: page.cards.map((card) => card.name),
        ids: page.cards.map((card) => card.id),
      }
    : {
        text: kingdoms.map((summary) => copy.kingdom[summary.kingdom]),
        ids: kingdoms.map((summary) => `kingdom:${summary.kingdom}`),
      };
  const discovery: PublicSurfaceDiscoveryResult =
    resolvePublicSurfaceDiscoveryForRequest({
      consumerId: "localized_catalog_browse",
      candidateState: "candidate",
      visibleText: listed.text,
      distinctPublicEntityIds: listed.ids,
      // One canonical for every filtered view (ADR-0029 D10).
      canonicalPath: buildPublicCatalogBrowseHref(locale),
      servedLocale: locale,
      equivalentLocales: [...PUBLIC_LOCALES],
    });

  const kingdomTitle =
    request.kingdoms.length === 1
      ? `${copy.kingdom[request.kingdoms[0]!]} · `
      : "";

  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: `${kingdomTitle}${copy.metadataTitle}`,
    description: copy.description,
    visibleFacts: {
      type: "CollectionPage",
      name: copy.title,
      description: copy.description,
      itemNames: kingdoms.map((summary) => copy.kingdom[summary.kingdom]),
    },
  });
}

export type { CatalogBrowsePage };
