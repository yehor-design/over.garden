import { NextResponse, type NextRequest } from "next/server";

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

function withAppRouteCacheControl(response: NextResponse) {
  response.headers.set("Cache-Control", APP_ROUTE_CACHE_CONTROL);

  return response;
}

function getLocaleRoutingRedirect(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/uk" || pathname.startsWith("/uk/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/uk" ? "/" : pathname.slice("/uk".length);

    return NextResponse.redirect(url, { status: 308 });
  }

  if (pathname === "/" && getCountryCode(request) === "BG") {
    const url = request.nextUrl.clone();
    url.pathname = "/bg";

    return NextResponse.redirect(url, { status: 307 });
  }

  return null;
}

// Next 16 renamed Middleware to Proxy. Better Auth handles its own cookies in
// the route handler via nextCookies(); this proxy stays deliberately light and
// must not become the authorization layer.
export function proxy(request: NextRequest) {
  const localeRedirect = getLocaleRoutingRedirect(request);

  if (localeRedirect) {
    return withAppRouteCacheControl(localeRedirect);
  }

  const response = NextResponse.next({ request });

  // App HTML/RSC/API responses are pilot evidence and may be personalized.
  // Keep them out of intermediary caches even if DNS is proxied later.
  return withAppRouteCacheControl(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|sw.js|manifest.webmanifest).*)",
  ],
};
