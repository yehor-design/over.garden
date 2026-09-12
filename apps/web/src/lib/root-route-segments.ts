import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
} from "@/lib/public-localization";

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
  "col",
  "communities",
  "engagement",
  "eppo",
  "erasure",
  "feed",
  "first-publication-disclosure",
  "garden",
  "gbif",
  "guides",
  "id",
  "journal",
  "journals",
  "knowledge",
  "licenses",
  "lineage",
  "markets",
  "notifications",
  "objects",
  "privacy",
  "sitemap.xml",
  "sitemaps",
  "skeleton",
  "sources",
  "species",
  "support",
  "topics",
  "variety",
  "wikidata",
  "wishlist",
]);

/**
 * Every file the site serves at the root: the App Router file conventions in
 * `src/app` (`robots.ts` → `/robots.txt`, `sitemap.ts` → `/sitemap.xml`,
 * `favicon.ico`, and the `icon`/`apple-icon` brand icons) plus the files at
 * the top of `public/`. Any other dotted root path (`/sw.js`, a web manifest,
 * `/icon-192.png`, `/wp-login.php`) would otherwise be swallowed by
 * `[locale]` and answer 200.
 */
export const ROOT_ROUTE_FILES: ReadonlySet<string> = new Set([
  "apple-icon.png",
  "favicon.ico",
  "file.svg",
  "globe.svg",
  "icon.svg",
  "next.svg",
  "robots.txt",
  "vercel.svg",
  "window.svg",
]);

/**
 * Root segments with no page of their own — a section that exists but has no
 * front door.
 *
 * `/species` and `/variety` answer `200` with a `noindex` body today, and so do
 * `/topics`, `/journal`, `/guides` and the rest of this list. The mechanism is
 * the same one `src/app/missing-route.tsx` documents: nothing matches the bare
 * path in `(default)`, so `[locale]/page.tsx` takes it with `locale` set to the
 * section name, calls `notFound()`, and the root loading boundary has already
 * streamed a 200 shell. A crawler reads 200.
 *
 * The non-document segments are deliberately absent: `api`, `engagement`,
 * `licenses`, `sitemaps` and `sitemap.xml` answer as route handlers or static
 * files, and an HTML 404 document is the wrong shape for them.
 *
 * `OVE-431` gives `/species` a real front door and takes it off this list.
 * `root-route-segments.test.ts` fails when the list and the filesystem drift.
 */
export const ROOT_SEGMENTS_WITHOUT_INDEX: ReadonlySet<string> = new Set([
  "account",
  "answers",
  "auth",
  "breed",
  "col",
  "eppo",
  "gbif",
  "guides",
  "id",
  "journal",
  "lineage",
  "markets",
  "sources",
  "topics",
  "variety",
  "wikidata",
]);

/**
 * Every first segment the `[locale]` route tree can serve after the prefix:
 * one entry per directory in `src/app/[locale]`, minus `[profileHandle]`,
 * which is dynamic and matches a handle.
 *
 * The prefixed tree is a subset of the unprefixed one — `/support` exists and
 * `/bg/support` does not — and the gap used to answer `200`. `[profileHandle]`
 * matches any single segment, so `/bg/support` reached it with the handle set
 * to `support`, failed the `@` check, called `notFound()`, and the root
 * loading boundary had already streamed the shell.
 */
export const LOCALE_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  "answers",
  "blog",
  "bookmarks",
  "breed",
  "col",
  "communities",
  "eppo",
  "feed",
  "first-publication-disclosure",
  "gbif",
  "guides",
  "id",
  "journal",
  "journals",
  "knowledge",
  "lineage",
  "markets",
  "notifications",
  "objects",
  "privacy",
  "sources",
  "species",
  "topics",
  "variety",
  "wikidata",
  "wishlist",
]);

/**
 * True when a locale-prefixed path asks for a section the prefixed tree does
 * not have. A handle is not a section, and the locale root itself is a page.
 */
export function isUnknownLocalizedPath(pathname: string): boolean {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const [first, second] = segments;
  if (!first || !isPublicLocale(first)) return false;
  // `/uk/**` is a legacy prefix, not a route family: it folds to the
  // unprefixed path with a 308 further down. Answering 404 here would take
  // `/uk/auth/reset-password?token=…` away from a reader following a mail
  // link instead of redirecting them to the page that works.
  if (first === DEFAULT_PUBLIC_LOCALE) return false;
  if (!second) return false;
  if (second.startsWith("@") || second.startsWith("%40")) return false;
  return !LOCALE_ROUTE_SEGMENTS.has(second);
}

/**
 * True when the path is a section root that nothing serves: exactly one
 * segment after the optional locale prefix, and that segment has no page.
 */
export function isSectionRootWithoutIndex(pathname: string): boolean {
  const segments = pathname
    .split("/")
    .filter((segment) => segment.length > 0);
  const withoutLocale =
    segments.length > 0 && isPublicLocale(segments[0]!)
      ? segments.slice(1)
      : segments;
  if (withoutLocale.length !== 1) return false;
  return ROOT_SEGMENTS_WITHOUT_INDEX.has(withoutLocale[0]!);
}

/**
 * True when no route can serve the first segment. Locale roots, profile
 * handles, Next internals, dot-prefixed well-known paths, and the known root
 * files (including the `sitemap.xml` route directory) stay with the App Router.
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
  if (segments.length === 1 && first.includes(".")) {
    return !ROOT_ROUTE_FILES.has(first) && !ROOT_ROUTE_SEGMENTS.has(first);
  }
  return !ROOT_ROUTE_SEGMENTS.has(first);
}
