/** An object's timeline at one of its portions (`OVE-518`). */
export function objectHistoryHref(objectId: string, page: number) {
  const path = `/garden/objects/${encodeURIComponent(objectId)}`;
  return page > 1 ? `${path}?page=${page}#passport-timeline` : path;
}

/** The portion an address asks for; anything that is not a page is the first. */
export function requestedHistoryPage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{1,6}$/u.test(raw)) return 1;
  return Math.max(1, Number(raw));
}
