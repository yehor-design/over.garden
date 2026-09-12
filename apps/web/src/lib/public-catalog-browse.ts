import { stripLocalePrefix, type PublicLocale } from "@/lib/public-localization";

/**
 * The shape of the catalog's front door (ADR-0029 D13 item 2, OVE-431).
 *
 * 114 669 organism pages had exactly eleven inbound internal links — one per
 * journal entry — so all but a handful were reachable only from the sitemap,
 * and a page nothing links to is low-priority to crawl however good the
 * sitemap is. This is the path that changes that: `/species` lists the
 * kingdoms, each kingdom lists its initials, and an initial lists the
 * organisms. Four clicks from `/` to any card, and every link is an `<a>` in
 * the HTML — no JavaScript anywhere on the path (ADR-0024).
 *
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

export const CATALOG_BROWSE_PATH = "/species";
export const CATALOG_BROWSE_PAGE_SIZE = 60;

const KINGDOM_BY_SLUG = new Map<string, CatalogBrowseKingdom>(
  CATALOG_BROWSE_KINGDOMS.map((kingdom) => [kingdom.toLowerCase(), kingdom]),
);

export function catalogKingdomSlug(kingdom: CatalogBrowseKingdom): string {
  return kingdom.toLowerCase();
}

export function catalogKingdomFromSlug(
  slug: string | null | undefined,
): CatalogBrowseKingdom | null {
  return slug ? (KINGDOM_BY_SLUG.get(slug.toLowerCase()) ?? null) : null;
}

/**
 * An initial a browse page can be asked for.
 *
 * Latin only, because a catalog name is a scientific name or a romanized
 * denomination — the `species` and `form` namespaces are `latin` in the
 * address manifest (ADR-0029 D4), so no card's name can begin with anything
 * else. `#` collects the digits, which a handful of cultivar names start with.
 */
export const CATALOG_BROWSE_INITIALS = [
  ..."abcdefghijklmnopqrstuvwxyz",
  "#",
] as const;

export type CatalogBrowseInitial = (typeof CATALOG_BROWSE_INITIALS)[number];

const INITIALS = new Set<string>(CATALOG_BROWSE_INITIALS);

export function catalogBrowseInitial(
  value: string | null | undefined,
): CatalogBrowseInitial | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  return INITIALS.has(normalized)
    ? (normalized as CatalogBrowseInitial)
    : null;
}

/** The initial a canonical name falls under, for both the query and the UI. */
export function initialOfCatalogName(canonicalName: string): CatalogBrowseInitial {
  const first = canonicalName.trim().charAt(0).toLowerCase();
  return INITIALS.has(first) && first !== "#"
    ? (first as CatalogBrowseInitial)
    : "#";
}

export interface PublicCatalogBrowseRequest {
  readonly kingdom: CatalogBrowseKingdom | null;
  readonly initial: CatalogBrowseInitial | null;
  readonly page: number;
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function normalizePublicCatalogBrowseRequest(
  searchParams: Record<string, string | string[] | undefined> = {},
): PublicCatalogBrowseRequest {
  const kingdom = catalogKingdomFromSlug(firstParam(searchParams.kingdom));
  const initial = catalogBrowseInitial(firstParam(searchParams.letter));
  const rawPage = firstParam(searchParams.page);
  const page =
    rawPage && /^\d+$/u.test(rawPage) && Number.isSafeInteger(Number(rawPage))
      ? Math.max(1, Number(rawPage))
      : 1;
  // An initial without a kingdom is not a view: the counts, the heading and
  // the crawl path are all per kingdom, so the request folds back to the root.
  return kingdom === null
    ? { kingdom: null, initial: null, page: 1 }
    : { kingdom, initial, page };
}

export function buildPublicCatalogBrowseHref(
  locale: PublicLocale,
  request: Partial<PublicCatalogBrowseRequest> = {},
): string {
  const params = new URLSearchParams();
  if (request.kingdom) params.set("kingdom", catalogKingdomSlug(request.kingdom));
  if (request.kingdom && request.initial) params.set("letter", request.initial);
  if (request.kingdom && request.page && request.page > 1) {
    params.set("page", String(request.page));
  }
  const query = params.toString();
  const base =
    locale === "uk" ? CATALOG_BROWSE_PATH : `/${locale}${CATALOG_BROWSE_PATH}`;
  return query ? `${base}?${query}` : base;
}

/** True for `/species` itself, in any locale — never for an organism page. */
export function isPublicCatalogBrowsePath(pathname: string): boolean {
  return (
    stripLocalePrefix(pathname).path.replace(/\/+$/u, "") ===
    CATALOG_BROWSE_PATH
  );
}
