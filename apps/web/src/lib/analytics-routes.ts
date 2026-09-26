/**
 * The only paths the product measures, and what a document says about the
 * reader's answer before it paints (ADR-0032 D7).
 *
 * These live here, outside any `"use client"` module, because two readers
 * need the *values*: the client components that load the tags and draw the
 * notice, and the inline script a document runs before its first paint. A
 * server component that imports a constant from a client module is handed a
 * reference, not the value.
 */
export const ANALYTICS_CONSENT_STORAGE_KEY = "overgarden:analytics-consent";

export const ANALYTICS_ALLOWED_EXACT_PATHS = [
  "/",
  "/blog",
  "/privacy",
  "/support",
  "/terms",
  "/cookies",
] as const;

export const ANALYTICS_ALLOWED_PREFIXES = [
  "/answers/",
  "/blog/",
  "/guides/",
  "/markets/",
] as const;

/** `<html data-analytics-consent="accepted | declined | undecided">`. */
export const ANALYTICS_CONSENT_ATTRIBUTE = "data-analytics-consent";

const PUBLIC_LOCALE_PREFIX_PATTERN = /^\/(?:uk|bg|ru)(?=\/|$)/;
const EXACT_PATHS: ReadonlySet<string> = new Set(ANALYTICS_ALLOWED_EXACT_PATHS);

export function isAnalyticsRoute(pathname: string | null): boolean {
  if (!pathname) return false;

  const normalizedPath = pathname.replace(PUBLIC_LOCALE_PREFIX_PATTERN, "") || "/";
  if (EXACT_PATHS.has(normalizedPath)) return true;

  return ANALYTICS_ALLOWED_PREFIXES.some((prefix) =>
    normalizedPath.startsWith(prefix),
  );
}

/**
 * What a document runs before it paints: has this reader already answered?
 *
 * The consent notice is part of every document's bytes, so it cannot wait for
 * React to learn the answer — it used to, and a reader who had declined months
 * ago watched the notice appear and vanish on every hard load, while on a page
 * with no photograph it was the largest thing painted and arrived with the
 * bundle (LCP 4.75 s on `/`, 2026-09-19). With the answer on `<html>` before
 * first paint, CSS decides: the notice is drawn from the first frame for the
 * reader who owes an answer, and never for anyone else — including a reader
 * without JavaScript, whom nothing here measures.
 *
 * The address is not asked. The notice is owed on every page until the reader
 * answers (the owner, 2026-09-21); only the tags are confined to the measured
 * paths, and they decide that for themselves once the bundle runs.
 */
export function analyticsDocumentBootScript(): string {
  const key = JSON.stringify(ANALYTICS_CONSENT_STORAGE_KEY);

  return (
    `(function(){try{var d=document.documentElement,c="undecided";` +
    `try{var s=localStorage.getItem(${key});if(s==="accepted"||s==="declined")c=s}catch(e){}` +
    `d.setAttribute("${ANALYTICS_CONSENT_ATTRIBUTE}",c)}catch(e){}})()`
  );
}
