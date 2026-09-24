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
  "catalog",
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
  "illustrations",
  "journal",
  "journals",
  "knowledge",
  "licenses",
  "lineage",
  "markets",
  "notifications",
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
  // The IndexNow key file (OVE-434). It is at the root because a key in a
  // subdirectory only authorises URLs in that subdirectory — `api.indexnow.org`
  // answers `422` otherwise, which is how this was found.
  "e1d2d024f0edaca0ebfb710bfc63f607.txt",
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
  "species",
  "topics",
  "variety",
  "wikidata",
]);

/**
 * Every first segment the `[locale]` route tree can serve after the prefix:
 * one entry per directory in `src/app/[locale]`, minus `[profileHandle]`,
 * which is dynamic and matches a handle.
 *
 * The prefixed tree is a subset of the unprefixed one — `/erasure` exists and
 * `/bg/erasure` does not — and the gap used to answer `200`. `[profileHandle]`
 * matches any single segment, so `/bg/erasure` reached it with the handle set
 * to `erasure`, failed the `@` check, called `notFound()`, and the root
 * loading boundary had already streamed the shell.
 */
export const LOCALE_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  "answers",
  "blog",
  "bookmarks",
  "breed",
  "catalog",
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
  "privacy",
  // Where a listing's query string renders (ADR-0032 D5). It is a directory of
  // this tree and never an address: the proxy answers 404 to a request that
  // names it, before this list is consulted (`isPublicQueryTwinPath`).
  "q",
  "sources",
  "species",
  "support",
  "topics",
  "variety",
  "wikidata",
  "wishlist",
]);

/**
 * Every address a section serves below its root: one pattern per `page.tsx`
 * or `route.ts` under `src/app/(default)/<section>` and
 * `src/app/[locale]/<section>`, with route groups dropped and a dynamic
 * segment spelled as its directory is.
 *
 * A path under one of these sections that matches none of them reached the
 * section's `[...missing]` catch-all and answered 200 with a `noindex` body —
 * `/catalog/x`, `/garden/objects/1/x`, `/bg/journals/x` — which is the fourth
 * outcome ADR-0029 D3 rules out (`OVE-478`). The proxy answers 404 to it now,
 * before anything streams.
 *
 * Absent on purpose: the sections whose sub-addresses the proxy resolves by
 * looking them up (`species`, `variety`, `breed`, `topics`, `communities`,
 * `journal`), `skeleton`, and everything that is not a document. The source
 * aliases (`col`, `eppo`, `gbif`, `id`, `wikidata`) are here with their one
 * segment, which their own handler looks up; what lies below it is nothing.
 * The one dynamic segment of `answers`, `guides`, `blog` and `markets` is a
 * name from the authored content, checked by `src/server/authored-addresses.ts`.
 * `root-route-segments.test.ts` fails when this table and the filesystem drift.
 */
export const SECTION_SUBPATHS: Readonly<Record<string, readonly string[]>> = {
  account: [
    "communities",
    "communities/[slug]",
    "communities/[slug]/settings",
    "moderation/comments",
    "security",
    "settings",
  ],
  answers: ["[slug]"],
  auth: [
    "help",
    "intent",
    "intent/resume",
    "intent/start",
    "reset-password",
    "sign-in",
    "sign-up",
  ],
  blog: ["[slug]"],
  bookmarks: [],
  catalog: [],
  col: ["[id]"],
  eppo: ["[code]"],
  erasure: [],
  feed: [],
  "first-publication-disclosure": [],
  garden: [
    "catalog/queue",
    "catalog/sources",
    "entries/[entryId]/edit",
    "lineage/claims",
    "lineage/invitations/claim",
    "lineage/invitations/claim/handoff",
    "lineage/questions",
    "new",
    "objects/[objectId]",
    "objects/[objectId]/provenance",
    "objects/[objectId]/settings",
    "objects/new",
    "privacy/erasure-requests",
    "profile",
    "spaces/[spaceId]",
    "spaces/[spaceId]/settings",
    "spaces/new",
  ],
  gbif: ["[key]"],
  guides: ["[slug]"],
  id: ["[uuid]"],
  journals: [],
  knowledge: [],
  lineage: ["objects/[objectId]"],
  markets: ["[market]"],
  notifications: ["settings"],
  privacy: [],
  sources: ["eppo", "eppo/[code]"],
  support: [],
  wikidata: ["[qid]"],
  wishlist: [],
};

/** The path's segments after an optional `bg`/`ru`/`uk` prefix. */
function segmentsAfterLocale(pathname: string) {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const first = segments[0];
  return first && isPublicLocale(first)
    ? { prefix: first, rest: segments.slice(1) }
    : { prefix: null, rest: segments };
}

/**
 * True when a path lies under a section of `SECTION_SUBPATHS` and matches none
 * of its addresses. The section root is not this function's question
 * (`isSectionRootWithoutIndex` is), and `/uk/**` is the legacy prefix that
 * folds to the unprefixed path with a 308 further down.
 */
export function isUnservedSectionPath(pathname: string): boolean {
  const { prefix, rest } = segmentsAfterLocale(pathname);
  if (prefix === DEFAULT_PUBLIC_LOCALE) return false;
  const [section, ...below] = rest;
  if (!section || below.length === 0) return false;
  const patterns = SECTION_SUBPATHS[section];
  if (!patterns) return false;
  return !patterns.some((pattern) => {
    const parts = pattern.split("/");
    return (
      parts.length === below.length &&
      parts.every((part, index) => part.startsWith("[") || part === below[index])
    );
  });
}

/** The authored sections whose one dynamic segment is a name, not an id. */
export type AuthoredSection = "answers" | "blog" | "guides" | "markets";

/**
 * `/answers/<slug>`, `/guides/<slug>`, `/blog/<slug>` and `/markets/<market>`,
 * with or without a `bg`/`ru` prefix: the name to check against the authored
 * content before the page renders. An unknown one rendered on demand, could
 * not be a static page, and answered 500 (`OVE-478`).
 */
export function matchAuthoredAddress(
  pathname: string,
): { section: AuthoredSection; name: string } | null {
  const { prefix, rest } = segmentsAfterLocale(pathname);
  if (prefix === DEFAULT_PUBLIC_LOCALE || rest.length !== 2) return null;
  const [section, name] = rest as [string, string];
  return section === "answers" ||
    section === "blog" ||
    section === "guides" ||
    section === "markets"
    ? { section, name }
    : null;
}

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
