import type { OwnedPhotoView } from "@/lib/garden/owned-photo";
import { LIST_PORTION_SIZE } from "@/lib/show-more";
import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * My garden as a collection (`OVE-489`): what the gardener owns, found by
 * name, ordered by a rule the gardener chose, and one press from writing
 * again. Everything the list shows is a fact the database holds — a name, a
 * kind, a species, a place, the date of the last entry — and nothing it
 * infers: a tomato not written about for three weeks is "last entry three
 * weeks ago", never "needs attention" (OG-UX-023).
 *
 * Spaces and plants or animals are two groups under one query, and two reads
 * that settle on their own (ADR-0023): a failed group says so and offers a
 * retry, and the other group still lists what it holds.
 */

export type GardenCollectionSort = "recent" | "name";
export type GardenCollectionKind = "all" | "object" | "space";

export interface GardenCollectionRequest {
  q: string;
  sort: GardenCollectionSort;
  kind: GardenCollectionKind;
  page: number;
}

/** Plants and animals on one page of the collection. */
export const GARDEN_COLLECTION_PAGE_SIZE = LIST_PORTION_SIZE;
/** Spaces shown beside the plants and animals before "All spaces". */
export const GARDEN_SPACES_PREVIEW_SIZE = 6;
/**
 * A garden this small is read, not searched: no search box, no orders, no
 * modes over a list the reader can see whole (criterion 3, "1 destination
 * stays simple").
 */
export const GARDEN_COLLECTION_SIMPLE_LIMIT = 6;
export const GARDEN_COLLECTION_QUERY_LIMIT = 120;
const MAX_PAGE = 10_000;

export interface GardenCollectionObjectItem {
  kind: "object";
  id: string;
  displayName: string;
  objectKind: "plant" | "animal";
  /**
   * The organism by the catalogue's canonical name, as the destination picker
   * and the object's page show it. Absent for an object the gardener named in
   * their own words.
   */
  species: string | null;
  space: { id: string; displayName: string };
  /** The observation date of the newest active entry, `YYYY-MM-DD`. */
  lastEntryDate: string | null;
}

export interface GardenCollectionSpaceItem {
  kind: "space";
  id: string;
  displayName: string;
  /** The space's own photo (ADR-0036 D1), when it has one. */
  photo?: OwnedPhotoView | null;
  objectCount: number;
  /**
   * The newest active entry written here: about the space itself or about
   * anything in it, `YYYY-MM-DD`.
   */
  lastEntryDate: string | null;
}

export type GardenCollectionItem =
  | GardenCollectionObjectItem
  | GardenCollectionSpaceItem;

export interface GardenCollectionGroup<TItem extends GardenCollectionItem> {
  items: TItem[];
  /** Items that match the query, across every page. */
  total: number;
  /** Everything of this kind the gardener owns, whatever the query. */
  owned: number;
}

export type GardenObjectsGroup =
  GardenCollectionGroup<GardenCollectionObjectItem>;
export type GardenSpacesGroup =
  GardenCollectionGroup<GardenCollectionSpaceItem>;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeGardenCollectionRequest(
  params: SearchParams,
): GardenCollectionRequest {
  const q = (first(params.q) ?? "")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, GARDEN_COLLECTION_QUERY_LIMIT);
  const sort = first(params.sort) === "name" ? "name" : "recent";
  const rawKind = first(params.kind);
  const kind: GardenCollectionKind =
    rawKind === "object" || rawKind === "space" ? rawKind : "all";
  const rawPage = first(params.page) ?? "1";
  const page = /^\d{1,6}$/u.test(rawPage) ? Number(rawPage) : 1;
  return {
    q,
    sort,
    kind,
    page: page > 0 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** The default view: everything, the recent order, the first page. */
export function isDefaultGardenCollectionRequest(
  request: GardenCollectionRequest,
): boolean {
  return (
    request.q === "" &&
    request.sort === "recent" &&
    request.kind === "all" &&
    request.page === 1
  );
}

/**
 * The address of a view of the collection. Defaults are left out, so the
 * plain `/garden` is the recent view of everything, and a view is a link a
 * reader can go back to, share with themselves, or reload.
 */
export function gardenCollectionHref(
  request: GardenCollectionRequest,
  patch: Partial<GardenCollectionRequest> = {},
  hash = "garden-collection",
): string {
  const next = { ...request, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.sort !== "recent") params.set("sort", next.sort);
  if (next.kind !== "all") params.set("kind", next.kind);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  const suffix = hash ? `#${hash}` : "";
  return query ? `/garden?${query}${suffix}` : `/garden${suffix}`;
}

/** An item's own anchor in the collection, so a return lands on its row. */
export function gardenCollectionItemAnchor(item: {
  kind: GardenCollectionItem["kind"];
  id: string;
}): string {
  return `garden-${item.kind}-${item.id}`;
}

/** Where an item's Write opens the one composer, and where Close returns. */
export function gardenCollectionWriteHref(
  item: { kind: GardenCollectionItem["kind"]; id: string },
  request: GardenCollectionRequest,
): string {
  const params = new URLSearchParams({
    [item.kind === "space" ? "space" : "object"]: item.id,
    returnTo: gardenCollectionHref(
      request,
      {},
      gardenCollectionItemAnchor(item),
    ),
  });
  return `/garden/new?${params.toString()}`;
}

/** An object's page, or a space's own page (`OVE-490`). */
export function gardenCollectionItemHref(item: {
  kind: GardenCollectionItem["kind"];
  id: string;
}): string {
  return item.kind === "space"
    ? `/garden/spaces/${encodeURIComponent(item.id)}`
    : `/garden/objects/${encodeURIComponent(item.id)}`;
}

const DAY_MS = 86_400_000;

function utcDay(value: string): number {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/**
 * When the gardener last wrote about it, as a reader says it: "сьогодні",
 * "3 дні тому", "2 місяці тому". It states when, never what that means for
 * the plant: a seasonal object resting over winter is not overdue.
 */
export function formatLastEntry(
  lastEntryDate: string,
  today: string,
  locale: InterfaceLocale,
): string {
  const days = Math.max(
    0,
    Math.round((utcDay(today) - utcDay(lastEntryDate)) / DAY_MS),
  );
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (days < 14) return format.format(-days, "day");
  if (days < 60) return format.format(-Math.round(days / 7), "week");
  if (days < 365) return format.format(-Math.round(days / 30), "month");
  return format.format(-Math.round(days / 365), "year");
}
