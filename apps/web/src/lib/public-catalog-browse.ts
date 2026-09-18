import {
  buildListingHref,
  readListingFacet,
} from "@/lib/public-listing-filters";
import { stripLocalePrefix, type PublicLocale } from "@/lib/public-localization";

/**
 * One catalogue, one address, one vocabulary (`OVE-451`).
 *
 * The catalogue had five doors. `/objects` listed the living objects gardeners
 * keep, `/species` listed the 114 669 organisms behind them, and `/variety`,
 * `/breed` and `/col` were the addresses of individual organisms — so a reader
 * could arrive at any of them without ever learning they were the same graph,
 * while the menu offered a sixth word for it again.
 *
 * There is one browse now, at `/catalog`, and the name is the one the product
 * already used everywhere else: the menu says *Каталог*, the schema says
 * `catalog_items`, the owner's own tools live at `/garden/catalog`. `/species`
 * and `/objects` answer `308` to the view they meant (ADR-0029 D8 — an address
 * a product has published never stops answering), and every organism's own
 * address is untouched.
 *
 * The facets speak the vocabulary `OVE-448` fixed in
 * `lib/public-listing-filters.ts`: one query parameter per facet, named for
 * the facet, repeated for multi-select, and **absent means unset**. Two
 * consequences worth stating, because both were defects before:
 *
 * - There is no `kingdom=all`. The unfiltered catalogue is `/catalog` with no
 *   query at all, which is its canonical and the only address that is.
 * - A parameter must also be declared in `lib/interface-route-policy.ts`, or
 *   the author-scoped rewrite drops it before the page can read it.
 */

export const CATALOG_BROWSE_PATH = "/catalog";

/** The addresses the one door replaced. Both still answer, as 308s. */
export const CATALOG_LEGACY_BROWSE_PATHS = ["/species", "/objects"] as const;

export const CATALOG_BROWSE_PAGE_SIZE = 60;

/**
 * Kingdoms are a closed list rather than whatever the data holds: an unknown
 * value would otherwise mint a crawlable page out of a typo in an import.
 */
export const CATALOG_BROWSE_KINGDOMS = [
  "Plantae",
  "Animalia",
  "Fungi",
  "Bacteria",
  "Chromista",
  "Viruses",
  "Protozoa",
  "Archaea",
] as const;

export type CatalogBrowseKingdom = (typeof CATALOG_BROWSE_KINGDOMS)[number];

/**
 * The ranks the catalogue actually holds, measured rather than assumed:
 * 79 862 species, 15 909 cultivars, 62 subspecies, 18 varieties, 12 breeds
 * (2026-09-18). A rank outside this list is not offered as a filter, for the
 * same reason a kingdom is not.
 */
export const CATALOG_BROWSE_RANKS = [
  "species",
  "cultivar",
  "subspecies",
  "variety",
  "breed",
] as const;

export type CatalogBrowseRank = (typeof CATALOG_BROWSE_RANKS)[number];

/** A market register an organism is attached to. */
export const CATALOG_BROWSE_REGISTERS = ["ua", "eu"] as const;

export type CatalogBrowseRegister = (typeof CATALOG_BROWSE_REGISTERS)[number];

/**
 * An initial the index can be asked for.
 *
 * Latin only, because a catalogue name is a scientific name or a romanized
 * denomination — the `species` and `form` namespaces are `latin` in the
 * address manifest (ADR-0029 D4), so no card's name can begin with anything
 * else. `#` collects the digits, which a handful of cultivar names start with.
 */
export const CATALOG_BROWSE_INITIALS = [
  ..."abcdefghijklmnopqrstuvwxyz",
  "#",
] as const;

export type CatalogBrowseInitial = (typeof CATALOG_BROWSE_INITIALS)[number];

/** Name first, because a catalogue is a reference before it is a feed. */
export const CATALOG_BROWSE_SORTS = ["name", "written"] as const;

export type CatalogBrowseSort = (typeof CATALOG_BROWSE_SORTS)[number];

export const CATALOG_BROWSE_DEFAULT_SORT: CatalogBrowseSort = "name";

export const CATALOG_BROWSE_MAX_QUERY_LENGTH = 120;

const KINGDOM_BY_SLUG = new Map<string, CatalogBrowseKingdom>(
  CATALOG_BROWSE_KINGDOMS.map((kingdom) => [kingdom.toLowerCase(), kingdom]),
);
const INITIALS = new Set<string>(CATALOG_BROWSE_INITIALS);
const RANKS = new Set<string>(CATALOG_BROWSE_RANKS);
const REGISTERS = new Set<string>(CATALOG_BROWSE_REGISTERS);
const SORTS = new Set<string>(CATALOG_BROWSE_SORTS);

export function catalogKingdomSlug(kingdom: CatalogBrowseKingdom): string {
  return kingdom.toLowerCase();
}

export function catalogKingdomFromSlug(
  slug: string | null | undefined,
): CatalogBrowseKingdom | null {
  return slug ? (KINGDOM_BY_SLUG.get(slug.toLowerCase()) ?? null) : null;
}

export function catalogBrowseInitial(
  value: string | null | undefined,
): CatalogBrowseInitial | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  return INITIALS.has(normalized) ? (normalized as CatalogBrowseInitial) : null;
}

/** The initial a canonical name falls under, for both the query and the UI. */
export function initialOfCatalogName(
  canonicalName: string,
): CatalogBrowseInitial {
  const first = canonicalName.trim().charAt(0).toLowerCase();
  return INITIALS.has(first) && first !== "#"
    ? (first as CatalogBrowseInitial)
    : "#";
}

export interface PublicCatalogBrowseRequest {
  readonly kingdoms: readonly CatalogBrowseKingdom[];
  readonly ranks: readonly CatalogBrowseRank[];
  readonly registers: readonly CatalogBrowseRegister[];
  /** Only organisms a gardener here has written about (ADR-0026 D9). */
  readonly grown: boolean;
  readonly initial: CatalogBrowseInitial | null;
  readonly query: string;
  readonly sort: CatalogBrowseSort;
  readonly page: number;
}

export const EMPTY_PUBLIC_CATALOG_BROWSE_REQUEST: PublicCatalogBrowseRequest = {
  kingdoms: [],
  ranks: [],
  registers: [],
  grown: false,
  initial: null,
  query: "",
  sort: CATALOG_BROWSE_DEFAULT_SORT,
  page: 1,
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function normalizePublicCatalogBrowseRequest(
  searchParams: Record<string, string | string[] | undefined> = {},
): PublicCatalogBrowseRequest {
  const kingdoms = readListingFacet(searchParams.kingdom)
    .map((value) => catalogKingdomFromSlug(value))
    .filter((value): value is CatalogBrowseKingdom => value !== null);
  const ranks = readListingFacet(searchParams.rank).filter(
    (value): value is CatalogBrowseRank => RANKS.has(value),
  );
  const registers = readListingFacet(searchParams.register).filter(
    (value): value is CatalogBrowseRegister => REGISTERS.has(value),
  );
  const rawSort = firstParam(searchParams.sort);
  const rawPage = firstParam(searchParams.page);
  const page =
    rawPage && /^\d+$/u.test(rawPage) && Number.isSafeInteger(Number(rawPage))
      ? Math.min(Math.max(1, Number(rawPage)), 10_000)
      : 1;

  return {
    kingdoms: [...new Set(kingdoms)],
    ranks: [...new Set(ranks)],
    registers: [...new Set(registers)],
    grown: firstParam(searchParams.grown) === "1",
    initial: catalogBrowseInitial(firstParam(searchParams.letter)),
    query: (firstParam(searchParams.q) ?? "")
      .trim()
      .slice(0, CATALOG_BROWSE_MAX_QUERY_LENGTH),
    sort:
      rawSort && SORTS.has(rawSort)
        ? (rawSort as CatalogBrowseSort)
        : CATALOG_BROWSE_DEFAULT_SORT,
    page,
  };
}

/** True when nothing is set — the catalogue's own canonical address. */
export function isUnfilteredCatalogBrowseRequest(
  request: PublicCatalogBrowseRequest,
): boolean {
  return (
    request.kingdoms.length === 0 &&
    request.ranks.length === 0 &&
    request.registers.length === 0 &&
    !request.grown &&
    request.initial === null &&
    request.query === "" &&
    request.sort === CATALOG_BROWSE_DEFAULT_SORT &&
    request.page === 1
  );
}

export function catalogBrowseBasePath(locale: PublicLocale): string {
  return locale === "uk"
    ? CATALOG_BROWSE_PATH
    : `/${locale}${CATALOG_BROWSE_PATH}`;
}

/**
 * One catalogue address.
 *
 * `page` and the default `sort` are dropped, because absent means unset and a
 * default written out gives one view two addresses.
 */
export function buildPublicCatalogBrowseHref(
  locale: PublicLocale,
  request: Partial<PublicCatalogBrowseRequest> = {},
): string {
  return buildListingHref(catalogBrowseBasePath(locale), {
    q: request.query ?? null,
    kingdom: (request.kingdoms ?? []).map(catalogKingdomSlug),
    rank: request.ranks ?? [],
    register: request.registers ?? [],
    grown: request.grown ? "1" : null,
    letter: request.initial ?? null,
    sort:
      request.sort && request.sort !== CATALOG_BROWSE_DEFAULT_SORT
        ? request.sort
        : null,
    page: request.page && request.page > 1 ? request.page : null,
  });
}

/** The same view with one facet value removed — the chip's own href. */
export function buildCatalogBrowseRemovalHref(
  locale: PublicLocale,
  request: PublicCatalogBrowseRequest,
  facet: "kingdom" | "rank" | "register" | "grown" | "letter" | "q",
  value?: string,
): string {
  const next: PublicCatalogBrowseRequest = {
    ...request,
    // Removing a filter returns to the first page of what is left: page 4 of a
    // narrower listing is a different set of results, and often an empty one.
    page: 1,
    kingdoms:
      facet === "kingdom"
        ? request.kingdoms.filter((item) => item !== value)
        : request.kingdoms,
    ranks:
      facet === "rank"
        ? request.ranks.filter((item) => item !== value)
        : request.ranks,
    registers:
      facet === "register"
        ? request.registers.filter((item) => item !== value)
        : request.registers,
    grown: facet === "grown" ? false : request.grown,
    initial: facet === "letter" ? null : request.initial,
    query: facet === "q" ? "" : request.query,
  };
  return buildPublicCatalogBrowseHref(locale, next);
}

/** True for the catalogue's own address, in any locale — never an organism. */
export function isPublicCatalogBrowsePath(pathname: string): boolean {
  return (
    stripLocalePrefix(pathname).path.replace(/\/+$/u, "") ===
    CATALOG_BROWSE_PATH
  );
}

/** True for an address the one door replaced, in any locale. */
export function matchLegacyCatalogBrowsePath(
  pathname: string,
): (typeof CATALOG_LEGACY_BROWSE_PATHS)[number] | null {
  const path = stripLocalePrefix(pathname).path.replace(/\/+$/u, "");
  return (
    CATALOG_LEGACY_BROWSE_PATHS.find((legacy) => legacy === path) ?? null
  );
}
