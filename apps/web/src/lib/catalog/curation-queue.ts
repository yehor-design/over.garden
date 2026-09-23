import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * The owner's two catalogue work queues, as addresses (`OVE-506`).
 *
 * A decision, an undo and a refresh each come back to the view they were
 * pressed in, with what happened named in the address and re-read from the
 * database by the page. Only the filter survives a decision: the item cursor
 * moves on to the next decision, and a confirmation grant never outlives the
 * item it was given for (`OVE-459` AC3).
 */
export const CURATION_QUEUE_PATH = "/garden/catalog/queue";
export const CATALOG_SOURCES_PATH = "/garden/catalog/sources";

/** The anchor an answer lands on: the notice, directly above the decision. */
export const CURATION_OUTCOME_ANCHOR = "queue-outcome";
export const CATALOG_SOURCES_OUTCOME_ANCHOR = "sources-outcome";

export const CURATION_ITEM_TYPES = [
  "label_link",
  "node_merge",
  "source_link",
  "split_review",
] as const;

export type CurationItemType = (typeof CURATION_ITEM_TYPES)[number];

/**
 * Why Accept cannot succeed for an open item, or null when it can. The
 * repository reads it from the same preconditions `catalog_apply_queue_item`
 * refuses on; see `CURATION_BLOCK_SQL`.
 */
export type CurationBlock =
  | "no_target"
  | "target_inactive"
  | "not_applied_here";

export const CURATION_RESULTS = [
  "accepted",
  "rejected",
  "skipped",
  "reverted",
  "stale",
  "failed",
  "confirm",
  "denied",
] as const;

export type CurationResult = (typeof CURATION_RESULTS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SOURCE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

type Query = Record<string, string | string[] | undefined>;

function first(
  value: string | string[] | FormDataEntryValue | null | undefined,
) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

export function readCurationUuid(
  value: string | string[] | FormDataEntryValue | null | undefined,
): string | null {
  const raw = first(value).toLowerCase();
  return UUID.test(raw) ? raw : null;
}

export function readCurationItemType(
  value: string | string[] | FormDataEntryValue | null | undefined,
): CurationItemType | null {
  const raw = first(value);
  return CURATION_ITEM_TYPES.find((type) => type === raw) ?? null;
}

export function readCatalogSourceSlug(
  value: string | string[] | FormDataEntryValue | null | undefined,
): string | null {
  const raw = first(value);
  return raw.length <= 80 && SOURCE_SLUG.test(raw) ? raw : null;
}

/**
 * A view of the queue. `decided` names the queue item an outcome concerns,
 * `action` the automatic action an undo concerns; the page reads both back
 * rather than trusting them.
 */
export function curationQueueHref(input: {
  type?: CurationItemType | null;
  item?: string | null;
  confirm?: boolean;
  result?: CurationResult;
  decided?: string | null;
  action?: string | null;
  hash?: string;
}): string {
  const params = new URLSearchParams();
  if (input.type) params.set("type", input.type);
  if (input.item) params.set("item", input.item);
  if (input.confirm) params.set("confirm", "merge");
  if (input.result) params.set("result", input.result);
  if (input.decided) params.set("decided", input.decided);
  if (input.action) params.set("action", input.action);
  const query = params.toString();
  const hash = input.hash ? `#${input.hash}` : "";
  return `${CURATION_QUEUE_PATH}${query ? `?${query}` : ""}${hash}`;
}

export interface CurationOutcome {
  result: CurationResult;
  decided: string | null;
  action: string | null;
}

/** What the last press did, re-checked: an unknown word is no outcome. */
export function readCurationOutcome(query: Query): CurationOutcome | null {
  const result = first(query.result);
  if (!(CURATION_RESULTS as readonly string[]).includes(result)) return null;
  return {
    result: result as CurationResult,
    decided: readCurationUuid(query.decided),
    action: readCurationUuid(query.action),
  };
}

export const CATALOG_SOURCES_RESULTS = [
  "queued",
  "failed",
  "denied",
  "unknown-source",
  "miss-queued",
  "miss-failed",
  "miss-denied",
] as const;

export type CatalogSourcesResult = (typeof CATALOG_SOURCES_RESULTS)[number];

export function catalogSourcesHref(input: {
  result?: CatalogSourcesResult;
  source?: string | null;
  queueItem?: string | null;
  hash?: string;
}): string {
  const params = new URLSearchParams();
  if (input.result) params.set("result", input.result);
  if (input.source) params.set("source", input.source);
  if (input.queueItem) params.set("queueItem", input.queueItem);
  const query = params.toString();
  const hash = input.hash ? `#${input.hash}` : "";
  return `${CATALOG_SOURCES_PATH}${query ? `?${query}` : ""}${hash}`;
}

export interface CatalogSourcesOutcome {
  result: CatalogSourcesResult;
  source: string | null;
  queueItem: string | null;
}

export function readCatalogSourcesOutcome(
  query: Query,
): CatalogSourcesOutcome | null {
  const result = first(query.result);
  if (!(CATALOG_SOURCES_RESULTS as readonly string[]).includes(result)) {
    return null;
  }
  return {
    result: result as CatalogSourcesResult,
    source: readCatalogSourceSlug(query.source),
    queueItem: readCurationUuid(query.queueItem),
  };
}

/** A source row's id on the page, so an answer can land on it. */
export function catalogSourceAnchor(sourceSlug: string): string {
  return `source-${sourceSlug}`;
}

const QUOTES: Record<InterfaceLocale, [string, string]> = {
  uk: ["«", "»"],
  bg: ["„", "“"],
  ru: ["«", "»"],
};

/** A gardener's or a searcher's words, set off as words. */
export function quoteCurationText(locale: InterfaceLocale, text: string) {
  const [open, close] = QUOTES[locale];
  return `${open}${text}${close}`;
}

/**
 * What a decision is about, in one line: the label and the card it would
 * join, or the two cards a merge would fold together. The same line names the
 * item in the table, on the review link and in the notice after it is
 * decided, so the owner recognises it in all three.
 */
export function curationItemName(
  locale: InterfaceLocale,
  item: {
    itemType: string;
    subjectLabel: string | null;
    subjectName: string | null;
    targetName: string | null;
  },
): string {
  const subject = item.subjectName ?? null;
  const target = item.targetName ?? null;
  if (item.itemType === "label_link" && item.subjectLabel) {
    const into = target ?? subject;
    const label = quoteCurationText(locale, item.subjectLabel);
    return into ? `${label} → ${into}` : label;
  }
  if (item.itemType === "node_merge" && subject && target) {
    return `${subject} → ${target}`;
  }
  return subject ?? target ?? item.subjectLabel ?? "—";
}

/**
 * What a notice may say about a queue item, given what the record holds now
 * (`OVE-506`). The address carries what the action concluded; the page
 * re-reads the item, and a claim the record does not bear out is not
 * repeated. "Failed — nothing changed" over an item the database holds as
 * decided becomes "already decided"; "accepted" over an item still open is
 * said not at all.
 */
export function queueOutcomeFromRecord(
  result: CurationResult,
  state: string,
): CurationResult | null {
  const open = state === "open";
  switch (result) {
    case "accepted":
      return state === "accepted" || state === "auto_applied"
        ? "accepted"
        : null;
    case "rejected":
      return state === "rejected" ? "rejected" : null;
    case "skipped":
      return state === "skipped" ? "skipped" : null;
    case "failed":
    case "confirm":
      return open ? result : "stale";
    case "stale":
      return open ? null : "stale";
    case "denied":
      return "denied";
    case "reverted":
      return null;
  }
}

/** The same, for an automatic decision and the undo pressed on it. */
export function automaticOutcomeFromRecord(
  result: CurationResult,
  reverted: boolean,
): CurationResult | null {
  switch (result) {
    case "reverted":
      return reverted ? "reverted" : null;
    case "failed":
      return reverted ? "stale" : "failed";
    case "stale":
      return reverted ? "stale" : null;
    case "denied":
      return "denied";
    default:
      return null;
  }
}
