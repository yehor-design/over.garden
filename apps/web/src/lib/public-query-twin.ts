import { matchPublicProfilePath } from "./public-profile-lifecycle";
import { stripLocalePrefix } from "./public-localization";

/**
 * A listing's two documents (ADR-0032 D5).
 *
 * `/journals` is a static document: prerendered, cached at the edge, its first
 * card's photograph in the served HTML. `/journals?topic=tomaty&page=2` cannot
 * be — a query string is request data, and a page that reads one is dynamic
 * from the line that reads it. Letting the one page read `searchParams` is
 * what made every listing dynamic for the reader who sent none.
 *
 * So a listing has a **twin**: the same renderer mounted under one reserved
 * segment, `/q`, where the query string *is* read. The proxy sends a request
 * there only when it carries a parameter the listing itself reads; every other
 * request — no query at all, or only `utm_source` and the like — gets the
 * static document. The address the reader sees never changes: this is a
 * rewrite, and `/q` is not an address. A request that names it from outside
 * answers 404.
 */
export const PUBLIC_QUERY_TWIN_SEGMENT = "q";

/**
 * The listings that have a twin mounted, by canonical path, and the parameters
 * each one reads.
 *
 * The keys are the listing's own — what its request normalizer looks at — and
 * not the interface route policy's `safeQueryKeys`, which is a different list
 * with a different job: what survives a change of language. The home feed
 * reads `topic`; the policy drops it, because a topic's slug is not the same
 * in another language. Deciding from the policy sent `/?topic=…` to the static
 * document, which ignores it.
 *
 * A path that is not here still reads its own query string and is not static
 * yet; adding it without mounting `[locale]/q/<path>/page.tsx` would 404 every
 * filtered view, which `public-query-twin.test.ts` refuses by walking the
 * filesystem.
 */
export const PUBLIC_QUERY_TWINS: ReadonlyMap<string, readonly string[]> =
  new Map([
    ["/", ["kind", "topic", "cursor"]],
    [
      "/catalog",
      ["kingdom", "rank", "register", "grown", "letter", "q", "sort", "page"],
    ],
    [
      "/journals",
      ["q", "kind", "catalog", "topic", "season", "region", "sort", "page"],
    ],
    ["/knowledge", ["q", "type", "kind"]],
  ]);

/**
 * The addresses whose path carries a name — a gardener's handle, a
 * community's slug — so a table keyed by path cannot hold them. Each twin is
 * mounted at the same dynamic route under `/q`, and reads only these keys.
 */
const PUBLIC_COMMUNITY_PATH = /^\/communities\/[a-z0-9][a-z0-9-]{1,63}$/u;

export const PUBLIC_QUERY_TWIN_PATTERNS: ReadonlyArray<{
  readonly route: string;
  readonly matches: (basePath: string) => boolean;
  readonly keys: readonly string[];
}> = [
  {
    route: "[profileHandle]",
    matches: (basePath) => matchPublicProfilePath(basePath) !== null,
    keys: ["tab"],
  },
  {
    // The community's own facets and its paging position; a membership
    // result or a resumed sign-in intent is read by the page's request-time
    // regions and keeps the static document.
    route: "communities/[slug]",
    matches: (basePath) => PUBLIC_COMMUNITY_PATH.test(basePath),
    keys: ["q", "kind", "cursor"],
  },
];

/**
 * Where a request with a query string renders, as a canonical path under the
 * locale — or `null` when the static document is the right one.
 */
export function publicQueryTwinPath(
  pathname: string,
  search: Pick<URLSearchParams, "getAll"> | string | null | undefined,
): string | null {
  const basePath = stripLocalePrefix(pathname).path;
  const keys =
    PUBLIC_QUERY_TWINS.get(basePath) ??
    PUBLIC_QUERY_TWIN_PATTERNS.find((twin) => twin.matches(basePath))?.keys;
  if (!keys || !search) return null;

  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  // A parameter that is present and empty says nothing (`/?kind=`), and the
  // listing's own normalizer reads it as unset. Repeated facets must inspect
  // every value: `?kingdom=&kingdom=plantae` is still a filtered request.
  if (!keys.some((key) => params.getAll(key).some((value) => value.length > 0)))
    return null;

  return basePath === "/"
    ? `/${PUBLIC_QUERY_TWIN_SEGMENT}`
    : `/${PUBLIC_QUERY_TWIN_SEGMENT}${basePath}`;
}

/** True for a path that names the reserved segment, with or without a locale. */
export function isPublicQueryTwinPath(pathname: string): boolean {
  const { path } = stripLocalePrefix(pathname);
  return (
    path === `/${PUBLIC_QUERY_TWIN_SEGMENT}` ||
    path.startsWith(`/${PUBLIC_QUERY_TWIN_SEGMENT}/`)
  );
}
