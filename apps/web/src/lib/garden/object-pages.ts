/**
 * The owned object's three pages (`OVE-491`; the IA's object route and its
 * `/settings` and `/provenance` children): its history — the default, with
 * writing — then the rare settings and the lineage records, each on its own
 * page so neither interrupts reading.
 */
export type ObjectSection = "history" | "settings" | "provenance";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** A malformed id is a record that is not in this garden, never a failure. */
export function isObjectId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function gardenObjectSectionPath(
  objectId: string,
  section: ObjectSection = "history",
  hash?: string,
): string {
  const base = `/garden/objects/${encodeURIComponent(objectId)}`;
  const path = section === "history" ? base : `${base}/${section}`;
  return hash ? `${path}#${hash}` : path;
}

/**
 * The history page's old fragments, which named blocks that have moved to
 * the settings and provenance pages. A fragment never reaches the server, so
 * the page maps it in the browser; each target page keeps the same `id`.
 */
const LEGACY_ANCHOR_SECTION: Readonly<Record<string, ObjectSection>> = {
  "passport-management": "settings",
  "passport-privacy": "settings",
  "passport-catalog": "settings",
  "passport-provenance": "provenance",
};

export function legacyObjectAnchorLocation(
  objectId: string,
  hash: string,
): string | null {
  const anchor = hash.replace(/^#/u, "");
  const section = Object.hasOwn(LEGACY_ANCHOR_SECTION, anchor)
    ? LEGACY_ANCHOR_SECTION[anchor]
    : undefined;
  return section ? gardenObjectSectionPath(objectId, section, anchor) : null;
}
