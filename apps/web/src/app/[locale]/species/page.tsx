import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";

import { PublicCatalogBrowse } from "@/components/public/public-catalog-browse";
import {
  buildPublicCatalogBrowseHref,
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
  readCatalogBrowseFirstHandOrganisms,
  readCatalogBrowseKingdoms,
  readCatalogBrowsePage,
} from "@/server/public-cache";
import {
  resolvePublicSurfaceDiscoveryForRequest,
  resolveUnresolvedPublicSurfaceDiscovery,
  type PublicSurfaceDiscoveryResult,
} from "@/server/public-surface-discovery";
import { buildPublicSurfaceMetadata } from "@/server/public-surface-metadata";
import type {
  CatalogBrowseCard,
  CatalogBrowseKingdomSummary,
  CatalogBrowsePage,
} from "@/server/public-catalog-browse-repository";

type SearchParams = Record<string, string | string[] | undefined>;

interface PublicSpeciesBrowseRouteProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<SearchParams>;
}

export function generateStaticParams() {
  return PREFIXED_PUBLIC_LOCALES.map((locale) => ({ locale }));
}

/**
 * The catalog's front door (ADR-0029 D13 item 2, OVE-431).
 *
 * `/species` answered a real 404 until this route existed — it was a section
 * root with no index — and the 114 669 organism pages under it had eleven
 * inbound internal links between them, one per journal entry. This page is the
 * inbound link: kingdoms, then initials, then organisms, all as plain anchors.
 *
 * The canonical is the browse root itself in every view. A kingdom and an
 * initial are filters over one listing, not addresses of their own (D10), and
 * the proxy stamps `noindex, follow` on any page past the first — so the
 * filtered views are crawled for their links and never compete with the root.
 */
export async function generateMetadata({
  params,
}: PublicSpeciesBrowseRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!isPublicLocale(localeParam)) {
    return {
      title: "OverGarden",
      robots: resolveUnresolvedPublicSurfaceDiscovery("localized_species_browse")
        .decision.robots,
    };
  }
  const kingdoms = await settled<CatalogBrowseKingdomSummary[]>(
    readCatalogBrowseKingdoms,
    [],
  );
  return buildSpeciesBrowseSurface(localeParam, kingdoms).metadata;
}

/**
 * The catalog is read at request time, and a read that failed is an empty
 * catalog rather than a broken page.
 *
 * `connection()` first, which is what every listing beside this one does
 * through `resolvePublicSurfacePayload`: it marks the scope as needing a
 * request, so the build never reaches the database. Without it `next build`
 * runs this query, and a preview deployment — which has no `DATABASE_URL` at
 * all — fails outright on `/species`. `Promise.allSettled` alone does not save
 * it: the prerender aborts on the rejection however it is handled.
 *
 * The reads stay cached for a day behind that (`readCatalogBrowse*`), so
 * request time costs one query per view per day, not one per crawler.
 *
 * A failure then renders the page with nothing in it, which the empty-listing
 * rule marks `noindex` (ADR-0022 D3) — the honest answer for a catalog nobody
 * can read.
 */
async function settled<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  // A thunk, not a promise: an argument is evaluated before the call, so
  // passing `read()` starts the query before `connection()` can postpone it —
  // which is how the first attempt at this still failed the build.
  await connection();
  const [result] = await Promise.allSettled([work()]);
  return result.status === "fulfilled" ? result.value : fallback;
}

export async function renderPublicSpeciesBrowsePage(
  locale: PublicLocale,
  searchParams: SearchParams = {},
) {
  const request = normalizePublicCatalogBrowseRequest(searchParams);
  const { kingdom, initial, page: pageNumber } = request;
  const [kingdoms, firstHand] = await Promise.all([
    settled<CatalogBrowseKingdomSummary[]>(readCatalogBrowseKingdoms, []),
    kingdom
      ? Promise.resolve<CatalogBrowseCard[]>([])
      : settled<CatalogBrowseCard[]>(readCatalogBrowseFirstHandOrganisms, []),
  ]);

  const page = kingdom
    ? await settled<CatalogBrowsePage | null>(
        () => readCatalogBrowsePage(kingdom, initial, pageNumber),
        null,
      )
    : null;

  // Past the last page is not a page (ADR-0029 D3). The proxy cannot bound
  // this one without repeating the count, so the route answers it — and
  // because the shell has already streamed, the honest answer a crawler reads
  // comes from the `noindex` this surface then carries.
  if (page && request.page > page.pageCount) notFound();

  const surface = buildSpeciesBrowseSurface(locale, kingdoms, request);

  return (
    <PublicCatalogBrowse
      locale={locale}
      copy={getPublicCatalogBrowseCopy(locale)}
      request={request}
      kingdoms={kingdoms}
      firstHand={firstHand}
      page={page}
      jsonLd={surface.jsonLd}
    />
  );
}

export default async function PublicSpeciesBrowseRoute({
  params,
  searchParams,
}: PublicSpeciesBrowseRouteProps) {
  const [{ locale: localeParam }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as SearchParams),
  ]);
  if (!isPublicLocale(localeParam)) notFound();
  return renderPublicSpeciesBrowsePage(localeParam, query);
}

function buildSpeciesBrowseSurface(
  locale: PublicLocale,
  kingdoms: readonly CatalogBrowseKingdomSummary[],
  request: PublicCatalogBrowseRequest = {
    kingdom: null,
    initial: null,
    page: 1,
  },
) {
  const copy = getPublicCatalogBrowseCopy(locale);
  const discovery: PublicSurfaceDiscoveryResult =
    resolvePublicSurfaceDiscoveryForRequest({
      consumerId: "localized_species_browse",
      candidateState: "candidate",
      visibleText: [
        copy.title,
        copy.description,
        ...kingdoms.map((summary) => copy.kingdom[summary.kingdom]),
      ],
      distinctPublicEntityIds: kingdoms.map(
        (summary) => `kingdom:${summary.kingdom}`,
      ),
      // One canonical for every filtered view: a kingdom and an initial are
      // filters, not addresses (D10).
      canonicalPath: buildPublicCatalogBrowseHref(locale),
      servedLocale: locale,
      equivalentLocales: [...PUBLIC_LOCALES],
    });

  return buildPublicSurfaceMetadata({
    discovery,
    locale,
    title: request.kingdom
      ? `${copy.kingdom[request.kingdom]} · ${copy.metadataTitle}`
      : copy.metadataTitle,
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
