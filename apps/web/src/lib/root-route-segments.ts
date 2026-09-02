import { isPublicLocale } from "@/lib/public-localization";

/**
 * Every first path segment the App Router can serve at the site root: one
 * entry per directory in `src/app` (except `[locale]`, which only accepts the
 * public locales) plus the directories served from `public/`. The proxy turns
 * any other first segment into a real 404 before rendering, because under
 * Cache Components a page that calls `notFound()` after the shell has streamed
 * still answers 200. `root-route-segments.test.ts` fails when this list and the
 * filesystem drift apart.
 */
export const ROOT_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  "account",
  "answers",
  "api",
  "auth",
  "blog",
  "bookmarks",
  "breed",
  "catalog",
  "communities",
  "engagement",
  "erasure",
  "feed",
  "first-publication-disclosure",
  "garden",
  "guides",
  "health",
  "journal",
  "journals",
  "knowledge",
  "licenses",
  "lineage",
  "markets",
  "notifications",
  "objects",
  "privacy",
  "skeleton",
  "sources",
  "species",
  "support",
  "topics",
  "variety",
  "wishlist",
]);

/**
 * True when no route can serve the first segment. Locale roots, profile
 * handles, Next internals, dot-prefixed well-known paths, and file-like paths
 * (`/robots.txt`, `/sitemap.xml`, `/sw.js`) stay with the App Router.
 */
export function isUnknownRootPath(pathname: string): boolean {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const first = segments[0];
  if (!first) return false;
  if (isPublicLocale(first)) return false;
  if (
    first.startsWith("@") ||
    first.startsWith("%40") ||
    first.startsWith(".") ||
    first === "_next"
  ) {
    return false;
  }
  if (segments[segments.length - 1].includes(".")) return false;
  return !ROOT_ROUTE_SEGMENTS.has(first);
}
