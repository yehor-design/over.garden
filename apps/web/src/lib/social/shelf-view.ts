import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import {
  localizedPath,
  stripLocalePrefix,
  type PublicLocale,
} from "@/lib/public-localization";

/**
 * Where a shelf action comes back to, and what it says when it gets there
 * (`OVE-502`).
 *
 * A removal used to land on the shelf's first page with no filter, so a
 * reader three pages into their varieties started over after every press.
 * The form now carries the view it was pressed in, and the answer returns to
 * exactly that view — the filter and the page, nothing else — with the
 * outcome, the action and the target it concerns.
 */
export type ShelfName = "bookmarks";
export type ShelfOutcome = "removed" | "restored" | "failed";
export type ShelfAction = "remove" | "restore";

const VIEW_KEYS = ["kind", "page"] as const;
const SAFE_VALUE = /^[A-Za-z0-9_-]{1,40}$/u;
/** `{kind}:{ref}`, the one shape a bookmark's target takes. */
const SAFE_TARGET = /^[a-z_]{1,32}:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

/** The shelf view a form was pressed in, or the shelf itself. */
export function shelfViewPath(
  shelf: ShelfName,
  value: FormDataEntryValue | string | null | undefined,
  locale: PublicLocale,
): string {
  const fallback = localizedPath(locale, `/${shelf}`);
  const raw = normalizeInternalReturnPath(value, fallback);
  const url = new URL(raw, "https://over.garden");
  if (stripLocalePrefix(url.pathname).path !== `/${shelf}`) return fallback;
  const view = new URLSearchParams();
  for (const key of VIEW_KEYS) {
    const item = url.searchParams.get(key);
    if (item && SAFE_VALUE.test(item)) view.set(key, item);
  }
  return view.size ? `${url.pathname}?${view}` : url.pathname;
}

/**
 * The view again, with what happened. A restore and a refused removal land
 * on the row they concern, which is on the shelf (again, or still). A refused
 * restore lands on the notice above the list, because its row is not there;
 * a removal lands nowhere in particular — its row is gone, and what it says
 * is a toast.
 */
export function shelfOutcomeHref(
  view: string,
  input: { outcome: ShelfOutcome; action: ShelfAction; target: string },
): string {
  const url = new URL(view, "https://over.garden");
  url.searchParams.set("outcome", input.outcome);
  url.searchParams.set("action", input.action);
  url.searchParams.set("target", input.target);
  url.hash =
    input.outcome === "removed"
      ? ""
      : input.outcome === "failed" && input.action === "restore"
        ? "shelf-outcome"
        : shelfRowAnchor(input.target);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A row's id on the page, from the same target an outcome names. */
export function shelfRowAnchor(target: string): string {
  return `saved-${target.replace(/[^A-Za-z0-9_-]/gu, "-")}`;
}

/** What the last action did, read back from the address and re-checked. */
export function readShelfOutcome(
  query: Record<string, string | string[] | undefined>,
): { outcome: ShelfOutcome; action: ShelfAction; target: string } | null {
  const outcome = first(query.outcome);
  const action = first(query.action);
  const target = first(query.target);
  if (
    (outcome !== "removed" && outcome !== "restored" && outcome !== "failed") ||
    (action !== "remove" && action !== "restore") ||
    !target ||
    !SAFE_TARGET.test(target)
  ) {
    return null;
  }
  return { outcome, action, target };
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
