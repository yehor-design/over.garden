import { NextResponse, type NextRequest } from "next/server";

import {
  INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS,
  INTERFACE_LOCALE_COOKIE_NAME,
  INTERFACE_LOCALE_REQUEST_HEADER,
  resolveInterfaceLocale,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
  stripLocalePrefix,
} from "@/lib/public-localization";
import {
  matchPublicObjectPassportPath,
  renderGonePublicObjectPassportHtml,
  renderNotFoundPublicObjectPassportHtml,
} from "@/lib/public-object-passport-lifecycle";
import {
  matchPublicJournalEntryPath,
  renderGonePublicJournalEntryHtml,
  renderNotFoundPublicJournalEntryHtml,
} from "@/lib/public-journal-entry-lifecycle";
import {
  matchPublicProfilePath,
  renderNotFoundPublicProfileHtml,
} from "@/lib/public-profile-lifecycle";
import { tryResolveVisualFixtureEnvironment } from "@/lib/visual-fixtures/environment";

export const APP_ROUTE_CACHE_CONTROL =
  "private, no-store, max-age=0, s-maxage=0, must-revalidate";

function getCountryCode(request: NextRequest) {
  return (
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code")
  )
    ?.trim()
    .toUpperCase();
}

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
  locale: InterfaceLocale,
) {
  response.headers.set("Cache-Control", APP_ROUTE_CACHE_CONTROL);
  response.headers.set("Content-Language", locale);

  if (
    isDocumentNavigationRequest(request) &&
    request.cookies.get(INTERFACE_LOCALE_COOKIE_NAME)?.value !== locale
  ) {
    response.cookies.set({
      name: INTERFACE_LOCALE_COOKIE_NAME,
      value: locale,
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
}

function resolveRequestLocale(request: NextRequest) {
  const routeLocale = stripLocalePrefix(request.nextUrl.pathname).locale;

  return resolveInterfaceLocale({
    routeLocale,
    persistedLocale: request.cookies.get(INTERFACE_LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: request.headers.get("accept-language"),
    countryCode: getCountryCode(request),
  });
}

function hasLocalizedPublicCounterpart(pathname: string) {
  const exactPaths = new Set([
    "/privacy",
    "/first-publication-disclosure",
    "/feed",
    "/notifications",
    "/bookmarks",
    "/wishlist",
    "/blog",
    "/objects",
  ]);
  const nestedPrefixes = ["/blog/", "/guides/", "/answers/", "/journal/"];

  return (
    exactPaths.has(pathname) ||
    nestedPrefixes.some((prefix) => pathname.startsWith(prefix))
  );
}

function getLocaleRoutingResponse(
  request: NextRequest,
  locale: InterfaceLocale,
) {
  const { pathname } = request.nextUrl;
  const isDocumentNavigation = isDocumentNavigationRequest(request);

  if (
    isDocumentNavigation &&
    (pathname === "/uk" || pathname.startsWith("/uk/"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/uk" ? "/" : pathname.slice("/uk".length);

    return NextResponse.redirect(url, { status: 308 });
  }

  if (pathname.startsWith("/@") && pathname.length > 2) {
    const url = request.nextUrl.clone();

    if (locale !== DEFAULT_PUBLIC_LOCALE) {
      if (!isDocumentNavigation) return null;

      url.pathname = localizedPath(locale, pathname);
      return NextResponse.redirect(url, { status: 307 });
    }

    if (request.method !== "GET") return null;

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(INTERFACE_LOCALE_REQUEST_HEADER, locale);
    url.pathname = `/uk${pathname}`;
    return NextResponse.rewrite(url, {
      request: {
        headers: requestHeaders,
      },
    });
  }

  if (
    isDocumentNavigation &&
    locale !== DEFAULT_PUBLIC_LOCALE &&
    hasLocalizedPublicCounterpart(pathname)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = localizedPath(locale, pathname);

    return NextResponse.redirect(url, { status: 307 });
  }

  if (
    isDocumentNavigation &&
    pathname === "/" &&
    locale !== DEFAULT_PUBLIC_LOCALE
  ) {
    const url = request.nextUrl.clone();
    url.pathname = localizedPath(locale, "/");

    return NextResponse.redirect(url, { status: 307 });
  }

  return null;
}

// Next 16 renamed Middleware to Proxy. Better Auth handles its own cookies in
// the route handler via nextCookies(); this proxy stays deliberately light and
// must not become the authorization layer.
export async function proxy(request: NextRequest) {
  const locale = resolveRequestLocale(request);
  if (
    isVisualFixturePath(normalizePathname(request.nextUrl.pathname)) &&
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
      locale,
    );
  }

  const publicProfileHandle = isDocumentNavigationRequest(request)
    ? matchPublicProfilePath(request.nextUrl.pathname)
    : null;
  if (publicProfileHandle) {
    const { getPublicProfileLifecycleLookup } =
      await import("@/server/public-profile-repository");
    const lookup = await getPublicProfileLifecycleLookup(publicProfileHandle);
    if (lookup.status === "not_found") {
      return withAppRouteContract(
        new NextResponse(renderNotFoundPublicProfileHtml(locale), {
          status: 404,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "X-Robots-Tag": "noindex, nofollow",
          },
        }),
        request,
        locale,
      );
    }
  }

  const localeRoutingResponse = getLocaleRoutingResponse(request, locale);

  if (localeRoutingResponse) {
    return withAppRouteContract(localeRoutingResponse, request, locale);
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
        new NextResponse(renderGonePublicObjectPassportHtml(locale), {
          status: 410,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "X-Robots-Tag": "noindex, nofollow",
          },
        }),
        request,
        locale,
      );
    }
    if (lookup.status === "not_found") {
      return withAppRouteContract(
        new NextResponse(renderNotFoundPublicObjectPassportHtml(locale), {
          status: 404,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "X-Robots-Tag": "noindex, nofollow",
          },
        }),
        request,
        locale,
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
        new NextResponse(renderGonePublicJournalEntryHtml(locale), {
          status: 410,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "X-Robots-Tag": "noindex, nofollow",
          },
        }),
        request,
        locale,
      );
    }
    if (lookup.status === "not_found") {
      return withAppRouteContract(
        new NextResponse(renderNotFoundPublicJournalEntryHtml(locale), {
          status: 404,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "X-Robots-Tag": "noindex, nofollow",
          },
        }),
        request,
        locale,
      );
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(INTERFACE_LOCALE_REQUEST_HEADER, locale);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // App HTML/RSC/API responses are pilot evidence and may be personalized.
  // Keep them out of intermediary caches even if DNS is proxied later.
  return withAppRouteContract(response, request, locale);
}

function isVisualFixturePath(pathname: string) {
  return (
    pathname === "/__visual-fixtures" ||
    pathname.startsWith("/__visual-fixtures/") ||
    pathname === "/api/__visual-fixtures" ||
    pathname.startsWith("/api/__visual-fixtures/")
  );
}

function normalizePathname(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|sw.js|manifest.webmanifest).*)",
  ],
};
