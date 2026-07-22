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
import {
  buildLocalizedInterfaceTarget,
  getInterfaceRoutePolicy,
  sanitizeInterfaceRouteSearch,
} from "@/lib/interface-route-policy";
import {
  DEFAULT_PUBLIC_LOCALE,
  stripLocalePrefix,
} from "@/lib/public-localization";
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
  INTERFACE_GLOBAL_ERROR_VISUAL_FIXTURE_HEADER,
  isInterfaceGlobalErrorVisualFixtureRequest,
} from "@/lib/localization/localization-visual-fixture";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";
import {
  isWalkingSkeletonRequestHostAllowed,
  tryResolveWalkingSkeletonEnvironment,
} from "@/lib/walking-skeleton/environment";

export const APP_ROUTE_CACHE_CONTROL =
  "private, no-store, max-age=0, s-maxage=0, must-revalidate";

const INTERNAL_PROFILE_REWRITE_HEADER =
  "x-overgarden-internal-profile-rewrite";
const INTERNAL_PROFILE_REWRITE_SIGNATURE_HEADER =
  "x-overgarden-internal-profile-rewrite-signature";
const INTERNAL_PROFILE_REWRITE_VERSION = "v1";
const INTERNAL_PROFILE_REWRITE_SIGNATURE_CONTEXT =
  "overgarden:internal-profile-rewrite:v1";

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

function withAppRouteContract(
  response: NextResponse,
  request: NextRequest,
  localization: ResolvedInterfaceLocalization,
) {
  response.headers.set("Cache-Control", APP_ROUTE_CACHE_CONTROL);
  response.headers.set("Content-Language", localization.locale);

  if (isDocumentNavigationRequest(request)) {
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
  const rootProfileHandle = strippedPath.locale
    ? null
    : matchPublicProfilePath(pathname);

  if (
    isDocumentNavigation &&
    (pathname === "/uk" || pathname.startsWith("/uk/")) &&
    !hasValidInternalProfileRewrite(request)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/uk" ? "/" : pathname.slice("/uk".length);

    return NextResponse.redirect(url, { status: 308 });
  }

  if (rootProfileHandle) {
    const url = request.nextUrl.clone();
    const rootProfilePath = `/@${rootProfileHandle}`;

    if (locale !== DEFAULT_PUBLIC_LOCALE) {
      if (!isDocumentNavigation) return null;

      const target = buildLocalizedInterfaceTarget({
        locale,
        pathname: rootProfilePath,
        search: request.nextUrl.searchParams,
      });
      if (!target) return null;
      const targetUrl = new URL(target, request.nextUrl);
      url.pathname = targetUrl.pathname;
      url.search = targetUrl.search;
      return NextResponse.redirect(url, { status: 307 });
    }

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

  if (
    isDocumentNavigation &&
    strippedPath.locale === null &&
    locale !== DEFAULT_PUBLIC_LOCALE &&
    getInterfaceRoutePolicy(strippedPath.path).mode === "localized-link"
  ) {
    const target = buildLocalizedInterfaceTarget({
      locale,
      pathname: strippedPath.path,
      search: request.nextUrl.searchParams,
    });
    if (!target) return null;
    const url = request.nextUrl.clone();
    const targetUrl = new URL(target, request.nextUrl);
    url.pathname = targetUrl.pathname;
    url.search = targetUrl.search;

    return NextResponse.redirect(url, { status: 307 });
  }

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
    return new NextResponse(
      renderNotFoundPublicProfileHtml(localization.locale, lifecycleLocation),
      {
        status: 404,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }

  const { getPublicProfileLifecycleLookup } =
    await import("@/server/public-profile-repository");
  const lookup = await getPublicProfileLifecycleLookup(
    publicProfileHandle,
    viewer.userId,
  );
  if (lookup.status === "gone") {
    return new NextResponse(
      renderGonePublicProfileHtml(localization.locale, lifecycleLocation),
      {
        status: 410,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }
  if (lookup.status === "not_found") {
    return new NextResponse(
      renderNotFoundPublicProfileHtml(localization.locale, lifecycleLocation),
      {
        status: 404,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
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
  const localization = resolveRequestLocalization(request);
  const { locale } = localization;
  const pathname = normalizePathname(request.nextUrl.pathname);
  if (
    isWalkingSkeletonPath(pathname) &&
    (!tryResolveWalkingSkeletonEnvironment(process.env) ||
      !isWalkingSkeletonRequestHostAllowed(request.nextUrl.hostname) ||
      !isWalkingSkeletonRequestHostAllowed(request.headers.get("host")))
  ) {
    return withAppRouteContract(
      new NextResponse(null, {
        status: 404,
        headers: {
          "X-Robots-Tag": "noindex, nofollow",
        },
      }),
      request,
      localization,
    );
  }

  if (
    isVisualFixturePath(pathname) &&
    !tryResolveVisualFixtureEnvironment(process.env)
  ) {
    return withAppRouteContract(
      new NextResponse(null, {
        status: 404,
        headers: {
          "X-Robots-Tag": "noindex, nofollow",
        },
      }),
      request,
      localization,
    );
  }

  const isDocumentNavigation = isDocumentNavigationRequest(request);
  const initialStrippedPath = stripLocalePrefix(request.nextUrl.pathname);
  const canonicalDefaultProfileHandle =
    isDocumentNavigation &&
    initialStrippedPath.locale === null &&
    locale === DEFAULT_PUBLIC_LOCALE
      ? matchPublicProfilePath(request.nextUrl.pathname)
      : null;
  if (canonicalDefaultProfileHandle) {
    // Default-locale profiles are internally rewritten to /uk for App Router
    // matching. Classify their terminal lifecycle on the canonical unprefixed
    // request first because a rewrite does not re-enter Proxy.
    const lifecycleResponse = await getPublicProfileLifecycleResponse(
      request,
      localization,
      canonicalDefaultProfileHandle,
    );
    if (lifecycleResponse) {
      return withAppRouteContract(lifecycleResponse, request, localization);
    }
  }

  // Canonical locale routing must happen before lifecycle lookups so an
  // unprefixed Bulgaria-market URL cannot emit a terminal response under the
  // wrong canonical path. Already-prefixed routes fall through to the bounded
  // lifecycle classifiers below.
  const localeRoutingResponse = getLocaleRoutingResponse(request, localization);

  if (localeRoutingResponse) {
    return withAppRouteContract(localeRoutingResponse, request, localization);
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
        new NextResponse(
          renderNotFoundPublicCommunityHtml(locale, lifecycleLocation),
          {
            status: 404,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "X-Robots-Tag": "noindex, nofollow",
            },
          },
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
        new NextResponse(
          renderGonePublicObjectPassportHtml(locale, lifecycleLocation),
          {
            status: 410,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "X-Robots-Tag": "noindex, nofollow",
            },
          },
        ),
        request,
        localization,
      );
    }
    if (lookup.status === "not_found") {
      return withAppRouteContract(
        new NextResponse(
          renderNotFoundPublicObjectPassportHtml(locale, lifecycleLocation),
          {
            status: 404,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "X-Robots-Tag": "noindex, nofollow",
            },
          },
        ),
        request,
        localization,
      );
    }
  }

  const publicJournalSlug = isDocumentNavigationRequest(request)
    ? matchPublicJournalEntryPath(request.nextUrl.pathname)
    : null;
  if (publicJournalSlug) {
    const { getPublicJournalEntryLifecycleLookup } =
      await import("@/server/journal-repository");
    const lookup =
      await getPublicJournalEntryLifecycleLookup(publicJournalSlug);
    if (lookup.status === "gone") {
      return withAppRouteContract(
        new NextResponse(
          renderGonePublicJournalEntryHtml(locale, lifecycleLocation),
          {
            status: 410,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "X-Robots-Tag": "noindex, nofollow",
            },
          },
        ),
        request,
        localization,
      );
    }
    if (lookup.status === "not_found") {
      return withAppRouteContract(
        new NextResponse(
          renderNotFoundPublicJournalEntryHtml(locale, lifecycleLocation),
          {
            status: 404,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "X-Robots-Tag": "noindex, nofollow",
            },
          },
        ),
        request,
        localization,
      );
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(INTERFACE_GLOBAL_ERROR_VISUAL_FIXTURE_HEADER);
  requestHeaders.delete(INTERNAL_PROFILE_REWRITE_HEADER);
  requestHeaders.delete(INTERNAL_PROFILE_REWRITE_SIGNATURE_HEADER);
  requestHeaders.set(INTERFACE_LOCALE_REQUEST_HEADER, locale);
  requestHeaders.set(INTERFACE_MARKET_REQUEST_HEADER, localization.market);
  if (
    isDocumentNavigationRequest(request) &&
    tryResolveVisualFixtureEnvironment(process.env) &&
    isInterfaceGlobalErrorVisualFixtureRequest(request.nextUrl)
  ) {
    requestHeaders.set(INTERFACE_GLOBAL_ERROR_VISUAL_FIXTURE_HEADER, "1");
  }
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // App HTML/RSC/API responses are pilot evidence and may be personalized.
  // Keep them out of intermediary caches even if DNS is proxied later.
  return withAppRouteContract(response, request, localization);
}

async function resolvePublicProfileViewer(
  request: NextRequest,
): Promise<{ ok: true; userId: string | null } | { ok: false }> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader.includes("overgarden.session_token=")) {
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
    return { ok: false };
  }
}

function isVisualFixturePath(pathname: string) {
  return (
    pathname === "/__visual-fixtures" ||
    pathname.startsWith("/__visual-fixtures/") ||
    pathname === "/api/__visual-fixtures" ||
    pathname.startsWith("/api/__visual-fixtures/")
  );
}

function isWalkingSkeletonPath(pathname: string) {
  return (
    pathname === "/skeleton" ||
    pathname.startsWith("/skeleton/") ||
    pathname === "/api/skeleton" ||
    pathname.startsWith("/api/skeleton/")
  );
}

function normalizePathname(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|sw.js|manifest.webmanifest).*)",
  ],
};
