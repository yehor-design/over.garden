import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  PublicCatalogBrowse,
  type PublicCatalogBrowseState,
} from "@/components/public/public-catalog-browse";
import { PublicCatalogDoor } from "@/components/public/public-catalog-door";
import {
  buildPublicCatalogBrowseHref,
  EMPTY_PUBLIC_CATALOG_BROWSE_REQUEST,
  isUnfilteredCatalogBrowseRequest,
  normalizePublicCatalogBrowseRequest,
  type PublicCatalogBrowseRequest,
} from "@/lib/public-catalog-browse";
import { getPublicCatalogBrowseCopy } from "@/lib/public-catalog-browse-copy";
import {
  isPublicLocale,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  readCatalogBrowseFacets,
  readCatalogBrowseKingdoms,
  readCatalogBrowsePage,
  readCatalogFirstHandOrganisms,
  readCatalogRegisterHubSpecies,
} from "@/server/public-cache";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolvePublicSurfacePayload,
  type PublicSurfaceDiscoverySource,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import type {
  CatalogBrowseFacetCounts,
  CatalogBrowseKingdomSummary,
  CatalogBrowsePage,
} from "@/server/public-catalog-browse-repository";

import {
  deferStaticRenderAfterFailure,
  deferStaticRenderWithoutDatabase,
  renderStaticPublicPage,
  type PublicRenderPhase,
} from "@/server/static-public-page";

type SearchParams = Record<string, string | string[] | undefined>;

interface PublicCatalogRouteProps {
  params: Promise<{ locale: string }>;
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
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PublicCatalogRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery(
        "localized_catalog_browse",
      ).decision.robots,
    };
  }
  const loaded = await resolvePublicSurfacePayload<
    CatalogBrowseKingdomSummary[]
  >({
    consumerId: "localized_catalog_browse",
    document: "static",
    load: async () => {
      const kingdoms = await readCatalogBrowseKingdoms();
      return {
        source: buildCatalogDiscoverySource(localeParam, kingdoms),
        payload: kingdoms,
      };
    },
  });
  return buildCatalogSurface(
    localeParam,
    loaded.payload ?? [],
    undefined,
    null,
    loaded,
  ).metadata;
}

export async function renderPublicCatalogPage(
  locale: PublicLocale,
  searchParams: SearchParams = {},
  phase: PublicRenderPhase = "request",
) {
  await deferStaticRenderWithoutDatabase(phase);
  const request = normalizePublicCatalogBrowseRequest(searchParams);
  // The catalogue's own address is its door; any filter, letter, sort or
  // search is the register (`OVE-496`).
  if (isUnfilteredCatalogBrowseRequest(request)) {
    return renderPublicCatalogDoor(locale, phase);
  }
  const [kingdomsResult, pageResult, facetsResult] = await Promise.allSettled([
    readCatalogBrowseKingdoms(),
    readCatalogBrowsePage(request, locale),
    readCatalogBrowseFacets(request),
  ]);
  if (
    [kingdomsResult, pageResult, facetsResult].some(
      (result) => result.status === "rejected",
    )
  )
    deferStaticRenderAfterFailure(phase);
  const kingdoms =
    kingdomsResult.status === "fulfilled" ? kingdomsResult.value : [];
  const page = pageResult.status === "fulfilled" ? pageResult.value : null;
  const facets =
    facetsResult.status === "fulfilled" ? facetsResult.value : null;

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
      state={state}
      jsonLd={surface.jsonLd}
    />
  );
}

/**
 * The door (`OVE-496`): four reads, each settled on its own, so a failure
 * hides one section and the search — which reads nothing — is always there.
 */
async function renderPublicCatalogDoor(
  locale: PublicLocale,
  phase: PublicRenderPhase,
) {
  const [kingdomsResult, registerHubsResult, firstHandResult, facetsResult] =
    await Promise.allSettled([
      readCatalogBrowseKingdoms(),
      readCatalogRegisterHubSpecies().then((rows) => [...rows].slice(0, 24)),
      readCatalogFirstHandOrganisms(locale),
      readCatalogBrowseFacets(EMPTY_PUBLIC_CATALOG_BROWSE_REQUEST),
    ]);
  const results = [
    kingdomsResult,
    registerHubsResult,
    firstHandResult,
    facetsResult,
  ];
  const failed = results.some((result) => result.status === "rejected");
  if (failed) deferStaticRenderAfterFailure(phase);
  const kingdoms =
    kingdomsResult.status === "fulfilled" ? kingdomsResult.value : [];
  const surface = buildCatalogSurface(locale, kingdoms);

  return (
    <PublicCatalogDoor
      locale={locale}
      copy={getPublicCatalogBrowseCopy(locale)}
      kingdomTotals={Object.fromEntries(
        kingdoms.map((summary) => [summary.kingdom, summary.total]),
      )}
      firstHand={
        firstHandResult.status === "fulfilled" ? firstHandResult.value : null
      }
      facets={facetsResult.status === "fulfilled" ? facetsResult.value : null}
      registerHubs={
        registerHubsResult.status === "fulfilled"
          ? registerHubsResult.value
          : null
      }
      state={failed ? "partial" : "ready"}
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
}: PublicCatalogRouteProps) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) notFound();
  return renderStaticPublicCatalogPage(locale);
}

export function renderStaticPublicCatalogPage(locale: PublicLocale) {
  return renderStaticPublicPage({
    render: (phase) => renderPublicCatalogPage(locale, {}, phase),
    fallback: (
      <PublicCatalogDoor
        locale={locale}
        copy={getPublicCatalogBrowseCopy(locale)}
        kingdomTotals={{}}
        firstHand={null}
        facets={null}
        registerHubs={null}
        state="loading"
      />
    ),
  });
}

function buildCatalogDiscoverySource(
  locale: PublicLocale,
  kingdoms: readonly CatalogBrowseKingdomSummary[],
  page: CatalogBrowsePage | null = null,
): PublicSurfaceDiscoverySource {
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
  return {
    consumerId: "localized_catalog_browse",
    candidateState: "candidate",
    visibleText: listed.text,
    distinctPublicEntityIds: listed.ids,
    // One canonical for every filtered view (ADR-0029 D10).
    canonicalPath: buildPublicCatalogBrowseHref(locale),
    servedLocale: locale,
    equivalentLocales: [...PUBLIC_LOCALES],
  };
}

function buildCatalogSurface(
  locale: PublicLocale,
  kingdoms: readonly CatalogBrowseKingdomSummary[],
  request: PublicCatalogBrowseRequest = normalizePublicCatalogBrowseRequest(),
  page: CatalogBrowsePage | null = null,
  discoveryOverride?: PublicSurfaceDiscoveryResult,
) {
  const copy = getPublicCatalogBrowseCopy(locale);
  const discovery =
    discoveryOverride ??
    resolvePublicSurfaceDiscoveryForRequest(
      buildCatalogDiscoverySource(locale, kingdoms, page),
    );

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
