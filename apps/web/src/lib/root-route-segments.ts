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
 * Every file the site serves at the root: the App Router file conventions in
 * `src/app` (`robots.ts` → `/robots.txt`, `sitemap.ts` → `/sitemap.xml`,
 * `favicon.ico`) plus the files at the top of `public/`. Any other dotted root
 * path (`/sw.js`, `/manifest.webmanifest`, `/icon-192.png`, `/wp-login.php`)
 * would otherwise be swallowed by `[locale]` and answer 200.
 */
export const ROOT_ROUTE_FILES: ReadonlySet<string> = new Set([
  "apple-icon.png",
  "favicon.ico",
  "file.svg",
  "globe.svg",
  "next.svg",
  "robots.txt",
  "sitemap.xml",
  "vercel.svg",
  "window.svg",
]);

/**
 * True when no route can serve the first segment. Locale roots, profile
 * handles, Next internals, dot-prefixed well-known paths, the sitemap index
 * chunks, and the known root files stay with the App Router.
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
    first === "_next" ||
    first === "sitemap"
  ) {
    return false;
  }
  if (segments.length === 1 && first.includes(".")) {
    return !ROOT_ROUTE_FILES.has(first);
  }
  return !ROOT_ROUTE_SEGMENTS.has(first);
}
