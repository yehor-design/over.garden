/**
 * The only paths the product measures, and the two attributes a document
 * carries about them (ADR-0032 D7).
 *
 * The list lives here, outside any `"use client"` module, because two readers
 * need the *values*: the client components that load the tags, and the inline
 * script a document runs before its first paint. A server component that
 * imports a constant from a client module is handed a reference, not the value.
 */
export const ANALYTICS_CONSENT_STORAGE_KEY = "overgarden:analytics-consent";

export const ANALYTICS_ALLOWED_EXACT_PATHS = [
  "/",
  "/blog",
  "/privacy",
  "/support",
  "/first-publication-disclosure",
] as const;

export const ANALYTICS_ALLOWED_PREFIXES = [
  "/answers/",
  "/blog/",
  "/guides/",
  "/markets/",
] as const;

/** `<html data-analytics-route="true">` on a path the product measures. */
export const ANALYTICS_ROUTE_ATTRIBUTE = "data-analytics-route";
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
 * What a document runs before it paints: is this a measured path, and has this
 * reader already answered?
 *
 * The consent notice is part of a static document's bytes, so it cannot wait
 * for React to learn either fact — it used to, and a reader who had declined
 * months ago watched the notice appear and vanish on every hard load, while on
 * a page with no photograph it was the largest thing painted and arrived with
 * the bundle (LCP 4.75 s on `/`, 2026-09-19). With both facts on `<html>`
 * before first paint, CSS decides: the notice is drawn from the first frame
 * for the reader who owes an answer, and never for anyone else — including a
 * reader without JavaScript, whom nothing here measures.
 */
export function analyticsDocumentBootScript(): string {
  const exact = JSON.stringify(ANALYTICS_ALLOWED_EXACT_PATHS);
  const prefixes = JSON.stringify(ANALYTICS_ALLOWED_PREFIXES);
  const key = JSON.stringify(ANALYTICS_CONSENT_STORAGE_KEY);

  return (
    `(function(){try{var d=document.documentElement,` +
    `p=location.pathname.replace(${PUBLIC_LOCALE_PREFIX_PATTERN},"")||"/",` +
    `c="undecided";` +
    `try{var s=localStorage.getItem(${key});if(s==="accepted"||s==="declined")c=s}catch(e){}` +
    `d.setAttribute("${ANALYTICS_CONSENT_ATTRIBUTE}",c);` +
    `if(${exact}.indexOf(p)>-1||${prefixes}.some(function(x){return p.indexOf(x)===0}))` +
    `d.setAttribute("${ANALYTICS_ROUTE_ATTRIBUTE}","true")}catch(e){}})()`
  );
}
