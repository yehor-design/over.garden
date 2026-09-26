import type { OwnedPhotoView } from "@/lib/garden/owned-photo";
import { LIST_PORTION_SIZE } from "@/lib/show-more";

/**
 * A space's own page in the workspace (`OVE-490`, IA: `/garden/spaces/[id]`).
 *
 * A space is a place the gardener owns — a balcony, a greenhouse — and its
 * page answers two questions: what lives here, and what was written here.
 * The history is an aggregate of the entries that belong to the space: notes
 * about the place itself and entries about anything in it, each shown once,
 * under its own address, labelled with what it is about. Nothing is copied:
 * an object's entry appearing here is the same entry with the same permalink.
 *
 * There is no public space address (ADR-0029): this page is private, and its
 * rows link to the one public permalink each entry already has.
 */

export const SPACE_OBJECTS_PREVIEW_SIZE = 6;
export const SPACE_HISTORY_PREVIEW_SIZE = 10;
export const SPACE_HISTORY_PAGE_SIZE = LIST_PORTION_SIZE;
const MAX_PAGE = 10_000;

export type SpacePageView = "overview" | "objects" | "history";

export interface SpacePageRequest {
  view: SpacePageView;
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeSpacePageRequest(
  params: SearchParams,
): SpacePageRequest {
  const rawView = first(params.view);
  const view: SpacePageView =
    rawView === "objects" || rawView === "history" ? rawView : "overview";
  const rawPage = first(params.page) ?? "1";
  const page = /^\d{1,6}$/u.test(rawPage) ? Number(rawPage) : 1;
  return {
    view,
    page: view === "overview" || page < 1 ? 1 : Math.min(page, MAX_PAGE),
  };
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isSpaceId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function gardenSpacePath(
  spaceId: string,
  view: Partial<SpacePageRequest> = {},
  hash = "",
): string {
  const params = new URLSearchParams();
  if (view.view && view.view !== "overview") params.set("view", view.view);
  if (view.view && view.view !== "overview" && view.page && view.page > 1) {
    params.set("page", String(view.page));
  }
  const query = params.toString();
  return `/garden/spaces/${encodeURIComponent(spaceId)}${
    query ? `?${query}` : ""
  }${hash ? `#${hash}` : ""}`;
}

export function gardenSpaceSettingsPath(spaceId: string): string {
  return `/garden/spaces/${encodeURIComponent(spaceId)}/settings`;
}

/** Write into the space itself, returning to its history. */
export function gardenSpaceWriteHref(spaceId: string): string {
  const params = new URLSearchParams({
    space: spaceId,
    returnTo: gardenSpacePath(spaceId, {}, "space-history"),
  });
  return `/garden/new?${params.toString()}`;
}

/** Add a plant or an animal with this space already chosen. */
export function gardenSpaceAddObjectHref(spaceId: string): string {
  const params = new URLSearchParams({
    space: spaceId,
    returnTo: gardenSpacePath(spaceId, {}, "space-objects"),
  });
  return `/garden/objects/new?${params.toString()}`;
}

/** An entry in the space's history: the space itself, or one thing in it. */
export interface SpaceHistoryEntry {
  id: string;
  title: string;
  /** `YYYY-MM-DD`, the observation date the gardener chose. */
  entryDate: string;
  about:
    | { kind: "space" }
    | {
        kind: "object";
        objectId: string;
        displayName: string;
        objectKind: "plant" | "animal";
      };
  /** The entry's one public address. */
  publicPath: string | null;
}

export interface SpaceHistoryPage {
  entries: SpaceHistoryEntry[];
  total: number;
}

export interface OwnedSpaceSummary {
  id: string;
  displayName: string;
  /** The space's own photo, its cover (ADR-0036 D1), when it has one. */
  photo: OwnedPhotoView | null;
  locationVisibility: "hidden" | "region";
  coarseRegionCode: string | null;
  objectCount: number;
  /** Active entries that belong here: the space's own and its objects'. */
  entryCount: number;
  lastEntryDate: string | null;
}

/**
 * What stands between a space and its deletion, counted from the database.
 * A space is deleted only when nothing hangs from it: no plant or animal and
 * no entry, including one still inside its seven-day deletion window.
 */
export interface SpaceDeletionBlockers {
  objectCount: number;
  entryCount: number;
}

export function spaceIsDeletable(blockers: SpaceDeletionBlockers): boolean {
  return blockers.objectCount === 0 && blockers.entryCount === 0;
}

/**
 * A space's journal lived on the garden page, `/garden?space={id}`, until it
 * had a page of its own. The old address keeps answering (ADR-0029 D8: a
 * published address never stops working): the proxy sends it here with a 308,
 * the post-save moment carried along. Anything else about the old URL — the
 * collection's own query — belonged to the garden page and is dropped.
 */
export function legacySpaceJournalLocation(url: URL): string | null {
  if (url.pathname !== "/garden") return null;
  const spaceId = url.searchParams.get("space");
  if (!isSpaceId(spaceId)) return null;
  const target = new URLSearchParams();
  const saveProgress = url.searchParams.get("saveProgress");
  if (saveProgress === "space-entry") target.set("saveProgress", saveProgress);
  const query = target.toString();
  return `/garden/spaces/${spaceId.toLowerCase()}${query ? `?${query}` : ""}`;
}
