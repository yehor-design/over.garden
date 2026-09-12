import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { resolveBetterAuthSecret } from "@/lib/auth-secret";
import {
  INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS,
  INTERFACE_LOCALE_COOKIE_NAME,
  INTERFACE_LOCALE_REQUEST_HEADER,
  resolveInterfaceLocalization,
  type ResolvedInterfaceLocalization,
} from "@/lib/interface-localization";
import {
  INTERFACE_MARKET_COOKIE_MAX_AGE_SECONDS,
  INTERFACE_MARKET_COOKIE_NAME,
  INTERFACE_MARKET_REQUEST_HEADER,
  readInterfaceCountryCode,
} from "@/lib/interface-market";
import { sanitizeInterfaceRouteSearch } from "@/lib/interface-route-policy";
import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
  stripLocalePrefix,
} from "@/lib/public-localization";
import { matchPublicCatalogAddressPath } from "@/lib/catalog/addresses";
import { renderNotFoundPublicCatalogHtml } from "@/lib/public-catalog-lifecycle";
import { isRetiredControlPlanePath } from "@/lib/retired-control-plane-routes";
import {
  matchPublicObjectPassportPath,
  renderGonePublicObjectPassportHtml,
  renderNotFoundPublicObjectPassportHtml,
} from "@/lib/public-object-passport-lifecycle";
import {
  matchPublicCommunityPath,
  renderNotFoundPublicCommunityHtml,
} from "@/lib/public-community-lifecycle";
import {
  matchPublicJournalEntryPath,
  renderGonePublicJournalEntryHtml,
  renderNotFoundPublicJournalEntryHtml,
} from "@/lib/public-journal-entry-lifecycle";
import {
  matchPublicProfilePath,
  renderGonePublicProfileHtml,
  renderNotFoundPublicProfileHtml,
} from "@/lib/public-profile-lifecycle";
import {
  isWalkingSkeletonRequestHostAllowed,
  tryResolveWalkingSkeletonEnvironment,
} from "@/lib/walking-skeleton/environment";

import { renderNotFoundUnknownRouteHtml } from "@/lib/public-unknown-route-lifecycle";
import { canonicalLowerCasePath } from "@/lib/address/canonical-case";
import {
  matchAddressPath,
  matchAuthorScopedEntryPath,
  matchAuthorScopedPath,
  unservableAddressNamespace,
} from "@/lib/address/match-address-path";
import {
  paginatedListingPageSize,
  paginatedListingRobotsTag,
  requestedListingPage,
} from "@/lib/public-listing-pagination";
import {
  matchPublicTopicPath,
  renderNotFoundPublicTopicHtml,
} from "@/lib/public-topic-lifecycle";
import {
  isSectionRootWithoutIndex,
  isUnknownLocalizedPath,
  isUnknownRootPath,
} from "@/lib/root-route-segments";
import {
  publicJournalEntryPath,
  publicObjectPassportPath,
  publicProfileBasePath,
} from "@/lib/garden/public-paths";

export const APP_ROUTE_CACHE_CONTROL =
  "private, no-store, max-age=0, s-maxage=0, must-revalidate";

const INTERNAL_PROFILE_REWRITE_HEADER = "x-overgarden-internal-profile-rewrite";
const INTERNAL_PROFILE_REWRITE_SIGNATURE_HEADER =
  "x-overgarden-internal-profile-rewrite-signature";
const INTERNAL_PROFILE_REWRITE_VERSION = "v1";
const INTERNAL_PROFILE_REWRITE_SIGNATURE_CONTEXT =
  "overgarden:internal-profile-rewrite:v1";
const CANONICAL_PRODUCTION_HOST = "over.garden";
const SESSION_COOKIE_NAME = "overgarden.session_token";
const NON_CANONICAL_PRODUCTION_HOST = "www.over.garden";

type InternalNamespace = "skeleton";

type InternalNamespacePath = {
  namespace: InternalNamespace;
  representation: "canonical" | "encoded";
};

function getHardNotFoundResponse() {
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": APP_ROUTE_CACHE_CONTROL,
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function matchInternalNamespacePath(
  pathname: string,
): InternalNamespace | null {
  const segments = pathname.replace(/\\/g, "/").split("/");
  const firstSegmentIndex = segments.findIndex((segment) => segment.length > 0);
  if (firstSegmentIndex === -1) return null;

  const first = segments[firstSegmentIndex];
  const second = segments[firstSegmentIndex + 1];
  if (first === "skeleton") return "skeleton";
  if (first !== "api") return null;
  if (second === "skeleton") return "skeleton";
  return null;
}

/**
 * Classifies only the reserved route syntax. `decodeURIComponent` runs at most
 * once, and the shallow escape check never decodes route data: it recognizes
 * only the percent bytes that spell an internal separator or namespace token.
 * That keeps a double-encoded internal path fail-closed without introducing a
 * general recursive URL normalizer.
 */
function matchEscapedInternalNamespacePath(
  pathname: string,
): InternalNamespace | null {
  const reservedSyntax = pathname
    .replace(/%2f|%5c/gi, "/")
    .replace(/%5f/gi, "_");
  const match = matchInternalNamespacePath(reservedSyntax);
  if (match) return match;

  const malformedReservedPrefix = reservedSyntax.match(
    /^\/+(?:api\/)?(skeleton)(?:[%\\/]|$)/,
  );
  if (malformedReservedPrefix?.[1] === "skeleton") return "skeleton";
  return null;
}

export function classifyInternalNamespacePath(
  rawPathname: string,
): InternalNamespacePath | null {
  const canonical = matchInternalNamespacePath(rawPathname);
  if (canonical) return { namespace: canonical, representation: "canonical" };

  try {
    const decoded = decodeURIComponent(rawPathname);
    const decodedNamespace = matchInternalNamespacePath(decoded);
    if (decodedNamespace) {
      return { namespace: decodedNamespace, representation: "encoded" };
    }
    const escapedNamespace = matchEscapedInternalNamespacePath(decoded);
    return escapedNamespace
      ? { namespace: escapedNamespace, representation: "encoded" }
      : null;
  } catch {
    const malformedNamespace = matchEscapedInternalNamespacePath(rawPathname);
    return malformedNamespace
      ? { namespace: malformedNamespace, representation: "encoded" }
      : null;
  }
}

function isProductionInternalNamespaceRequest() {
  return process.env.VERCEL_ENV === "production";
}

/**
 * A prefetch this layer can actually recognise.
 *
 * The honest limit, measured rather than assumed: Next strips its own router
 * headers — `rsc`, `next-router-prefetch`, `next-router-state-tree`,
 * `next-router-segment-prefetch` — before middleware runs, so the two checks
 * below for them never fire on an App Router prefetch. They are kept because
 * they cost nothing and a future runtime may forward them. What does reach here
 * is browser-initiated speculation: `Purpose: prefetch` and `Sec-Purpose`, and
 * `x-middleware-prefetch` when a runtime sets it.
 *
 * The consequence is that a `<Link>` to a *different* locale must not be
 * prefetchable, because this layer cannot tell that prefetch from a landing.
 * `language-switcher.tsx` passes `prefetch={false}` for exactly that reason, and
 * `language-switcher.test.tsx` fails if it comes back. Verified in Chromium
 * against a production build on 2026-09-04.
 */
function isPrefetchRequest(request: NextRequest) {
  const purpose = request.headers.get("purpose")?.toLowerCase() ?? "";
  const secPurpose = request.headers.get("sec-purpose")?.toLowerCase() ?? "";

  return (
    request.headers.has("next-router-prefetch") ||
    request.headers.has("x-middleware-prefetch") ||
    purpose.includes("prefetch") ||
    secPurpose.includes("prefetch")
  );
}

/**
 * A navigation the reader performed, whether the browser fetched a document or
 * the router fetched an RSC payload. Browser-initiated prefetches are excluded;
 * a router prefetch is invisible here, so cross-locale links carry
 * `prefetch={false}` instead — see `isPrefetchRequest`.
 */
function isNavigationRequest(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (request.nextUrl.pathname.startsWith("/api/")) return false;
  if (isPrefetchRequest(request)) return false;
  if (request.headers.has("next-action")) return false;
  return true;
}

function isDocumentNavigationRequest(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (request.nextUrl.pathname.startsWith("/api/")) return false;
  if (isPrefetchRequest(request)) return false;
  if (
    request.headers.has("rsc") ||
    request.headers.has("next-router-state-tree") ||
    request.headers.has("next-action")
  ) {
    return false;
  }

  const destination = request.headers.get("sec-fetch-dest")?.toLowerCase();
  if (destination && destination !== "document") return false;

  const accept = request.headers.get("accept")?.toLowerCase();
  return !accept || accept.includes("text/html") || accept.includes("*/*");
}

function getCanonicalHostResponse(request: NextRequest) {
  if (
    request.nextUrl.hostname !== NON_CANONICAL_PRODUCTION_HOST ||
    !isDocumentNavigationRequest(request)
  ) {
    return null;
  }
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.hostname = CANONICAL_PRODUCTION_HOST;
  url.port = "";
  return NextResponse.redirect(url, { status: 308 });
}

/**
 * A lifecycle document with the status and the robots header it needs.
 *
 * Ten call sites spelled this out; the header matters and is easy to forget.
 * A 404 or 410 the proxy renders is the terminal answer for that address, so
 * it says `noindex, nofollow` even though a 404 already tells a crawler
 * enough — the body is a real page and Google has been known to index one.
 */
function notFoundDocument(html: string, status: 404 | 410 = 404) {
  return new NextResponse(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function getCanonicalTrailingSlashResponse(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/" || !pathname.endsWith("/")) return null;

  const url = new URL(request.url);
  url.pathname = pathname.replace(/\/+$/, "") || "/";
  return NextResponse.redirect(url, { status: 308 });
}

/**
 * An upper-case address 308s to its lower-case self, the way a trailing slash
 * already does (ADR-0029 D3).
 *
 * It runs after the trailing-slash rule so `/bg/topics/PLANTS/` needs two
 * redirects rather than a combined one — which is correct, because each rule
 * fixes a different thing and a reader who typed both gets told about both.
 * It runs before every bounded lookup, so an upper-case slug is redirected
 * rather than looked up and answered 404.
 */
function getCanonicalCaseResponse(request: NextRequest) {
  const canonical = canonicalLowerCasePath(request.nextUrl.pathname);
  if (!canonical) return null;

  const url = new URL(request.url);
  url.pathname = canonical;
  return NextResponse.redirect(url, { status: 308 });
}

/**
 * Routes whose responses may hold personal data and never enter a shared
 * cache (ADR-0022, D4). Public pages keep the cache headers Next emits for
 * their prerendered shell; everything the proxy answers itself (redirects,
 * lifecycle documents, hard 404s) stays `no-store` as well.
 */
const NO_STORE_ROUTE_PREFIXES = [
  "/garden",
  "/account",
  "/auth",
  "/erasure",
  "/api",
  "/skeleton",
] as const;

/**
 * Public data routes that read no cookie and no personal data and set their
 * own short public cache (ADR-0026 D7; the one exception to `AGENTS.md`
 * hard rule 5). The route decides its `Cache-Control`; the proxy leaves it.
 */
const PUBLIC_CACHEABLE_ROUTE_PREFIXES = ["/api/public/catalog"] as const;

export function isNoStoreAppRoute(pathname: string) {
  const path = stripLocalePrefix(pathname).path;
  if (
    PUBLIC_CACHEABLE_ROUTE_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    return false;
  }
  return NO_STORE_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function withAppRouteContract(
  response: NextResponse,
  request: NextRequest,
  localization: ResolvedInterfaceLocalization,
  options: { passThrough?: boolean } = {},
) {
  if (!options.passThrough || isNoStoreAppRoute(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", APP_ROUTE_CACHE_CONTROL);
  }
  response.headers.set("Content-Language", localization.locale);

  // A client-side navigation is an RSC GET, not a document load, and choosing a
  // language on a public page is now exactly that (OVE-379). Persisting only on
  // document loads would show the new language immediately and forget it until
  // the next full page load, so the preference is written on both.
  if (isNavigationRequest(request)) {
    if (
      request.cookies.get(INTERFACE_MARKET_COOKIE_NAME)?.value !==
      localization.market
    ) {
      response.cookies.set({
        name: INTERFACE_MARKET_COOKIE_NAME,
        value: localization.market,
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: INTERFACE_MARKET_COOKIE_MAX_AGE_SECONDS,
      });
    }

    if (
      request.cookies.get(INTERFACE_LOCALE_COOKIE_NAME)?.value !==
      localization.locale
    ) {
      response.cookies.set({
        name: INTERFACE_LOCALE_COOKIE_NAME,
        value: localization.locale,
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS,
      });
    }
  }

  return response;
}

function resolveRequestLocalization(request: NextRequest) {
  const routeLocale = stripLocalePrefix(request.nextUrl.pathname).locale;

  return resolveInterfaceLocalization({
    routeLocale,
    persistedMarket: request.cookies.get(INTERFACE_MARKET_COOKIE_NAME)?.value,
    persistedLocale: request.cookies.get(INTERFACE_LOCALE_COOKIE_NAME)?.value,
    countryCode: readInterfaceCountryCode(request.headers),
  });
}

function getLocaleRoutingResponse(
  request: NextRequest,
  localization: ResolvedInterfaceLocalization,
) {
  const { locale } = localization;
  const { pathname } = request.nextUrl;
  const isDocumentNavigation = isDocumentNavigationRequest(request);
  const strippedPath = stripLocalePrefix(pathname);
  // Every address under `/@` is rewritten into the `[locale]` tree the same
  // way the profile always was: the profile itself, an entry, and an object
  // passport (ADR-0029 D9). Without this, `/@yehor/полив` would be matched by
  // `[locale]/[profileHandle]` with the locale set to `@yehor`.
  const rootAuthorScopedPath = strippedPath.locale
    ? null
    : matchAuthorScopedPath(pathname);

  if (
    isDocumentNavigation &&
    (pathname === "/uk" || pathname.startsWith("/uk/")) &&
    !hasValidInternalProfileRewrite(request)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/uk" ? "/" : pathname.slice("/uk".length);

    return NextResponse.redirect(url, { status: 308 });
  }

  if (rootAuthorScopedPath) {
    const url = request.nextUrl.clone();
    // Rebuilt from the matched parts rather than copied from the request, so
    // `/%40green_thumb` rewrites to `/uk/@green_thumb` and not to itself.
    const rootProfilePath =
      rootAuthorScopedPath.kind === "profile"
        ? publicProfileBasePath(rootAuthorScopedPath.handle)
        : rootAuthorScopedPath.kind === "journalEntry"
          ? publicJournalEntryPath(
              rootAuthorScopedPath.handle,
              rootAuthorScopedPath.slug!,
            )
          : publicObjectPassportPath(
              rootAuthorScopedPath.handle,
              rootAuthorScopedPath.slug!,
            );

    // `/@handle` is a canonical address and stays one whatever country the
    // request came from (ADR-0029 D10). It used to 307 to `/bg/@handle` here.
    if (request.method !== "GET" && request.method !== "HEAD") return null;

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(INTERFACE_LOCALE_REQUEST_HEADER, locale);
    requestHeaders.set(INTERFACE_MARKET_REQUEST_HEADER, localization.market);
    url.pathname = `/uk${rootProfilePath}`;
    url.search = sanitizeInterfaceRouteSearch(
      rootProfilePath,
      request.nextUrl.searchParams,
    );
    requestHeaders.set(
      INTERNAL_PROFILE_REWRITE_HEADER,
      INTERNAL_PROFILE_REWRITE_VERSION,
    );
    requestHeaders.set(
      INTERNAL_PROFILE_REWRITE_SIGNATURE_HEADER,
      signInternalProfileRewrite(request.method, url.pathname),
    );
    return NextResponse.rewrite(url, {
      request: {
        headers: requestHeaders,
      },
    });
  }

  // A canonical URL answers 200 to everyone (ADR-0029 D10). What used to sit
  // here sent every unprefixed `localized-link` path to `/bg` or `/ru` on the
  // strength of `x-vercel-ip-country`, Googlebot included — so the URLs the
  // sitemap submits were redirects, and which one a crawler landed on depended
  // on the IP its request left from.
  //
  // The replacement is not another redirect. `hreflang` is the mechanism for
  // showing a Bulgarian searcher the Bulgarian page, and it only works when the
  // alternate is not itself a redirect; the site shell offers the other locale
  // to a reader who arrives in the wrong one.
  return null;
}

async function getPublicProfileLifecycleResponse(
  request: NextRequest,
  localization: ResolvedInterfaceLocalization,
  publicProfileHandle: string,
) {
  const lifecycleLocation = {
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.searchParams,
  };
  const viewer = await resolvePublicProfileViewer(request);
  if (!viewer.ok) {
    return notFoundDocument(
      renderNotFoundPublicProfileHtml(localization.locale, lifecycleLocation),
    );
  }

  const { getPublicProfileLifecycleLookup } =
    await import("@/server/public-profile-repository");
  const lookup = await getPublicProfileLifecycleLookup(
    publicProfileHandle,
    viewer.userId,
  );
  if (lookup.status === "gone") {
    return notFoundDocument(
      renderGonePublicProfileHtml(localization.locale, lifecycleLocation), 410,
    );
  }
  if (lookup.status === "not_found") {
    return notFoundDocument(
      renderNotFoundPublicProfileHtml(localization.locale, lifecycleLocation),
    );
  }

  return null;
}

// Next 16 renamed Middleware to Proxy. Better Auth handles cookie mutation in
// route handlers via nextCookies(). This proxy performs only bounded document
// lifecycle/privacy classification; a signed-in profile request resolves the
// viewer solely to fail closed on mutual blocks and is not a mutation authz
// boundary.
export async function proxy(request: NextRequest) {
  const internalNamespacePath = classifyInternalNamespacePath(
    request.nextUrl.pathname,
  );
  if (
    internalNamespacePath &&
    (internalNamespacePath.representation === "encoded" ||
      isProductionInternalNamespaceRequest())
  ) {
    return getHardNotFoundResponse();
  }

  if (
    internalNamespacePath?.namespace === "skeleton" &&
    (!tryResolveWalkingSkeletonEnvironment(process.env) ||
      !isWalkingSkeletonRequestHostAllowed(request.nextUrl.hostname) ||
      !isWalkingSkeletonRequestHostAllowed(request.headers.get("host")))
  ) {
    return getHardNotFoundResponse();
  }

  if (isRetiredControlPlanePath(request.nextUrl.pathname)) {
    return getHardNotFoundResponse();
  }

  const canonicalTrailingSlashResponse =
    getCanonicalTrailingSlashResponse(request);
  if (canonicalTrailingSlashResponse) return canonicalTrailingSlashResponse;

  const canonicalCaseResponse = getCanonicalCaseResponse(request);
  if (canonicalCaseResponse) return canonicalCaseResponse;

  const canonicalHostResponse = getCanonicalHostResponse(request);
  if (canonicalHostResponse) return canonicalHostResponse;
  const localization = resolveRequestLocalization(request);
  const { locale } = localization;

  // A first segment no route can serve must not reach `[locale]`: under Cache
  // Components the page would stream a 200 shell before `notFound()` runs.
  if (isUnknownRootPath(request.nextUrl.pathname)) {
    return withAppRouteContract(
      notFoundDocument(
        renderNotFoundUnknownRouteHtml(locale, {
          pathname: request.nextUrl.pathname,
          search: request.nextUrl.searchParams,
        }),
      ),
      request,
      localization,
    );
  }

  const isDocumentNavigation = isDocumentNavigationRequest(request);

  // Two more shapes that used to reach a `[...missing]` catch-all and answer
  // 200 with a `noindex` body: a section root nothing serves (`/species`,
  // `/topics`) and a path under an address prefix that could never be one
  // (`/topics/Не слаг`, `/journal/a/b`). `src/app/missing-route.tsx` explains
  // why the page cannot fix this itself — the root loading boundary has
  // already streamed the shell by the time `notFound()` runs.
  if (
    isDocumentNavigation &&
    (isSectionRootWithoutIndex(request.nextUrl.pathname) ||
      isUnknownLocalizedPath(request.nextUrl.pathname) ||
      unservableAddressNamespace(request.nextUrl.pathname) !== null)
  ) {
    return withAppRouteContract(
      notFoundDocument(
        renderNotFoundUnknownRouteHtml(locale, {
          pathname: request.nextUrl.pathname,
          search: request.nextUrl.searchParams,
        }),
      ),
      request,
      localization,
    );
  }

  const initialStrippedPath = stripLocalePrefix(request.nextUrl.pathname);

  // An entry and an object passport have one address each, under their author
  // and with no locale prefix (ADR-0029 D9, D10). `/bg/@yehor/полив` is a
  // second spelling of the same page, and a second spelling is a duplicate.
  if (
    isDocumentNavigation &&
    initialStrippedPath.locale !== null &&
    matchAuthorScopedPath(request.nextUrl.pathname)?.kind !== "profile" &&
    matchAuthorScopedPath(request.nextUrl.pathname) !== null
  ) {
    const url = request.nextUrl.clone();
    url.pathname = initialStrippedPath.path;
    return withAppRouteContract(
      NextResponse.redirect(url, { status: 308 }),
      request,
      localization,
    );
  }

  // Every address these two families have ever had answers 308 to the one
  // they have now (D8). The entry's legacy address is decided in its lifecycle
  // block below, from the one lookup that block already performs — two lookups
  // for one request is how the first draft of this consumed a test's mock and
  // answered 200 to a removed entry.
  const legacyPassportId = isDocumentNavigation
    ? matchAddressPath("object", request.nextUrl.pathname)
    : null;
  if (legacyPassportId) {
    const { getPublicObjectPassportAddress } = await import(
      "@/server/public-object-passport-repository"
    );
    const address = await getPublicObjectPassportAddress(
      legacyPassportId,
    ).catch(() => null);
    if (address) {
      const url = request.nextUrl.clone();
      url.pathname = publicObjectPassportPath(address.handle, address.slug);
      return withAppRouteContract(
        NextResponse.redirect(url, { status: 308 }),
        request,
        localization,
      );
    }
  }
  const canonicalDefaultProfileHandle =
    isDocumentNavigation && initialStrippedPath.locale === null
      ? matchPublicProfilePath(request.nextUrl.pathname)
      : null;
  if (canonicalDefaultProfileHandle) {
    // Unprefixed profiles are internally rewritten to /uk for App Router
    // matching. Classify their terminal lifecycle on the canonical unprefixed
    // request first, because a rewrite does not re-enter Proxy.
    //
    // This must not depend on the interface locale. It used to, and it was
    // only safe because the geo-307 below carried every other locale away
    // before it got here; with that redirect gone (ADR-0029 D10) a reader in
    // any other language would have been rewritten past this lookup and shown
    // a removed profile's page instead of its 404 or 410 document.
    const lifecycleResponse = await getPublicProfileLifecycleResponse(
      request,
      localization,
      canonicalDefaultProfileHandle,
    );
    if (lifecycleResponse) {
      return withAppRouteContract(lifecycleResponse, request, localization);
    }
  }

  // What remains of locale routing: the `/uk` prefix folds to the canonical
  // unprefixed path, and an unprefixed profile is rewritten into the App
  // Router's `[locale]` tree. Neither depends on where the reader is.
  const localeRoutingResponse = getLocaleRoutingResponse(request, localization);

  if (localeRoutingResponse) {
    // A rewrite is not an answer of the proxy's own — the page behind it
    // renders and Next sets its own cache headers. Forcing `no-store` here
    // would make every profile, entry and passport uncacheable, which is the
    // whole public surface once addresses moved under `/@` (ADR-0029 D9). A
    // 308 keeps `no-store`, because a redirect the proxy decided is the
    // proxy's own answer.
    return withAppRouteContract(localeRoutingResponse, request, localization, {
      passThrough:
        localeRoutingResponse.headers.has("x-middleware-rewrite") ||
        localeRoutingResponse.headers.get("x-middleware-next") === "1",
    });
  }

  const lifecycleLocation = {
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.searchParams,
  };

  const publicCommunitySlug = isDocumentNavigation
    ? matchPublicCommunityPath(request.nextUrl.pathname)
    : null;
  if (publicCommunitySlug) {
    const { getPublicCommunityLifecycleLookup } =
      await import("@/server/community-repository");
    const lookup = await getPublicCommunityLifecycleLookup(publicCommunitySlug);
    if (lookup.status === "not_found") {
      return withAppRouteContract(
        notFoundDocument(
          renderNotFoundPublicCommunityHtml(locale, lifecycleLocation),
        ),
        request,
        localization,
      );
    }
  }

  // A page past the end of a listing is nothing at all, and answered
  // `200, index, follow` with an empty body — infinite crawlable space behind
  // one query parameter. Read only when the request asks past page one.
  if (
    isDocumentNavigation &&
    requestedListingPage(request.nextUrl.searchParams) !== null &&
    paginatedListingPageSize(request.nextUrl.pathname) !== null
  ) {
    const { isListingPageBeyondTheEnd } =
      await import("@/server/public-listing-bounds");
    const beyond = await isListingPageBeyondTheEnd(
      request.nextUrl.pathname,
      request.nextUrl.searchParams,
    ).catch(() => false);
    if (beyond) {
      return withAppRouteContract(
        notFoundDocument(
          renderNotFoundUnknownRouteHtml(locale, lifecycleLocation),
        ),
        request,
        localization,
      );
    }
  }

  const publicTopicSlug = isDocumentNavigation
    ? matchPublicTopicPath(request.nextUrl.pathname)
    : null;
  if (publicTopicSlug) {
    const { getPublicTopicLifecycleLookup } =
      await import("@/server/public-topic-repository");
    const lookup = await getPublicTopicLifecycleLookup(publicTopicSlug);
    if (lookup.status === "not_found") {
      return withAppRouteContract(
        notFoundDocument(
          renderNotFoundPublicTopicHtml(locale, lifecycleLocation),
        ),
        request,
        localization,
      );
    }
  }

  const publicProfileHandle = isDocumentNavigation
    ? matchPublicProfilePath(request.nextUrl.pathname)
    : null;
  if (publicProfileHandle) {
    const lifecycleResponse = await getPublicProfileLifecycleResponse(
      request,
      localization,
      publicProfileHandle,
    );
    if (lifecycleResponse) {
      return withAppRouteContract(lifecycleResponse, request, localization);
    }
  }

  const publicObjectId = isDocumentNavigationRequest(request)
    ? matchPublicObjectPassportPath(request.nextUrl.pathname)
    : null;
  if (publicObjectId) {
    const { getPublicObjectPassportLookup } =
      await import("@/server/public-object-passport-repository");
    const lookup = await getPublicObjectPassportLookup(publicObjectId);
    if (lookup.status === "gone") {
      return withAppRouteContract(
        notFoundDocument(
          renderGonePublicObjectPassportHtml(locale, lifecycleLocation), 410,
        ),
        request,
        localization,
      );
    }
    if (lookup.status === "not_found") {
      return withAppRouteContract(
        notFoundDocument(
          renderNotFoundPublicObjectPassportHtml(locale, lifecycleLocation),
        ),
        request,
        localization,
      );
    }
  }

  const publicJournalSlug = isDocumentNavigationRequest(request)
    ? (matchPublicJournalEntryPath(request.nextUrl.pathname) ??
      matchAuthorScopedEntryPath(request.nextUrl.pathname)?.slug ??
      null)
    : null;
  if (publicJournalSlug) {
    const [{ getPublicJournalEntryLifecycleLookup }, { resolveJournalEntryAddress }] =
      await Promise.all([
        import("@/server/journal-repository"),
        import("@/server/journal-slug-repository"),
      ]);
    const lookup =
      await getPublicJournalEntryLifecycleLookup(publicJournalSlug);
    const authorScoped = matchAuthorScopedEntryPath(request.nextUrl.pathname);
    // A slug that is not the entry's current one may still be one it used to
    // have, and the history table is what turns that into a 308 rather than a
    // 404 (ADR-0029 D8). Read only when the live lookup found nothing, so the
    // ordinary request pays nothing for it.
    const historical =
      lookup.status === "not_found"
        ? await resolveJournalEntryAddress(publicJournalSlug).catch(() => null)
        : null;
    if (historical) {
      const url = request.nextUrl.clone();
      url.pathname = publicJournalEntryPath(historical.handle, historical.slug);
      url.search = sanitizeInterfaceRouteSearch(
        url.pathname,
        request.nextUrl.searchParams,
      );
      return withAppRouteContract(
        NextResponse.redirect(url, { status: 308 }),
        request,
        localization,
      );
    }
    if (lookup.status === "active" && lookup.addressHandle) {
      const canonical = publicJournalEntryPath(
        lookup.addressHandle,
        lookup.publicSlug,
      );
      // Either the request used an older address — `/journal/{slug}` or one of
      // its locale-prefixed spellings — or it used the canonical one under a
      // handle that is not the author's. Both answer 308 to the one address
      // the entry has (ADR-0029 D8, D9).
      if (
        stripLocalePrefix(request.nextUrl.pathname).path !== canonical ||
        initialStrippedPath.locale !== null
      ) {
        const url = request.nextUrl.clone();
        url.pathname = canonical;
        url.search = sanitizeInterfaceRouteSearch(
          canonical,
          request.nextUrl.searchParams,
        );
        return withAppRouteContract(
          NextResponse.redirect(url, { status: 308 }),
          request,
          localization,
        );
      }
    }
    if (
      lookup.status === "active" &&
      authorScoped &&
      lookup.addressHandle !== authorScoped.handle
    ) {
      return withAppRouteContract(
        notFoundDocument(
          renderNotFoundPublicJournalEntryHtml(locale, lifecycleLocation),
        ),
        request,
        localization,
      );
    }
    if (lookup.status === "gone") {
      return withAppRouteContract(
        notFoundDocument(
          renderGonePublicJournalEntryHtml(locale, lifecycleLocation), 410,
        ),
        request,
        localization,
      );
    }
    if (lookup.status === "not_found") {
      return withAppRouteContract(
        notFoundDocument(
          renderNotFoundPublicJournalEntryHtml(locale, lifecycleLocation),
        ),
        request,
        localization,
      );
    }
  }

  // Organism addresses (ADR-0026 D8): a historical slug, an old `/variety` or
  // `/breed` path, a form under a stale species slug or a merged node answers
  // 308 to the canonical address; an address nothing resolves answers 404.
  // Decided here, before any shell streams, so the status is real; a failed
  // lookup lets the page decide rather than answering an error itself.
  const catalogAddress = isDocumentNavigationRequest(request)
    ? matchPublicCatalogAddressPath(request.nextUrl.pathname)
    : null;
  if (catalogAddress) {
    const { resolvePublicCatalogAddress } =
      await import("@/server/public-catalog-address-repository");
    const lookup = await resolvePublicCatalogAddress(catalogAddress).catch(
      () => null,
    );
    if (lookup?.status === "redirect") {
      const prefixLocale = stripLocalePrefix(request.nextUrl.pathname).locale;
      const url = request.nextUrl.clone();
      url.pathname = localizedPath(
        prefixLocale ?? DEFAULT_PUBLIC_LOCALE,
        lookup.canonicalPath,
      );
      return withAppRouteContract(
        NextResponse.redirect(url, { status: 308 }),
        request,
        localization,
      );
    }
    if (lookup?.status === "not_found") {
      return withAppRouteContract(
        notFoundDocument(
          renderNotFoundPublicCatalogHtml(locale, lifecycleLocation),
        ),
        request,
        localization,
      );
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(INTERNAL_PROFILE_REWRITE_HEADER);
  requestHeaders.delete(INTERNAL_PROFILE_REWRITE_SIGNATURE_HEADER);
  requestHeaders.set(INTERFACE_LOCALE_REQUEST_HEADER, locale);
  requestHeaders.set(INTERFACE_MARKET_REQUEST_HEADER, localization.market);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Page two of a listing is not a page of its own. It cannot say so in its
  // own `<head>` — see `paginatedListingRobotsTag` — so it says so here,
  // before anything streams.
  const paginationRobots = paginatedListingRobotsTag(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
  );
  if (paginationRobots) response.headers.set("X-Robots-Tag", paginationRobots);

  // Workspace, account, auth, and API responses may contain personal data and
  // stay out of every shared cache. Public pages keep the cache headers Next
  // emits for their prerendered shell (ADR-0022, D4).
  return withAppRouteContract(response, request, localization, {
    passThrough: true,
  });
}

async function resolvePublicProfileViewer(
  request: NextRequest,
): Promise<{ ok: true; userId: string | null } | { ok: false }> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader.includes(`${SESSION_COOKIE_NAME}=`)) {
    return { ok: true, userId: null };
  }

  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id;
    return {
      ok: true,
      userId: typeof userId === "string" && userId.length > 0 ? userId : null,
    };
  } catch {
    return { ok: true, userId: null };
  }
}

function signInternalProfileRewrite(method: string, pathname: string) {
  return createHmac("sha256", resolveBetterAuthSecret())
    .update(INTERNAL_PROFILE_REWRITE_SIGNATURE_CONTEXT)
    .update("\0")
    .update(method)
    .update("\0")
    .update(pathname)
    .digest("base64url");
}

function hasValidInternalProfileRewrite(request: NextRequest) {
  if (
    request.headers.get(INTERNAL_PROFILE_REWRITE_HEADER) !==
    INTERNAL_PROFILE_REWRITE_VERSION
  ) {
    return false;
  }

  const suppliedSignature = request.headers.get(
    INTERNAL_PROFILE_REWRITE_SIGNATURE_HEADER,
  );
  if (!suppliedSignature?.match(/^[A-Za-z0-9_-]{43}$/)) return false;

  const expectedSignature = signInternalProfileRewrite(
    request.method,
    request.nextUrl.pathname,
  );
  const suppliedSignatureBytes = Buffer.from(suppliedSignature, "base64url");
  const expectedSignatureBytes = Buffer.from(expectedSignature, "base64url");
  if (
    suppliedSignatureBytes.length !== 32 ||
    suppliedSignatureBytes.length !== expectedSignatureBytes.length
  ) {
    return false;
  }

  return timingSafeEqual(suppliedSignatureBytes, expectedSignatureBytes);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
