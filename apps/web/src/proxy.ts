import { NextResponse, type NextRequest } from "next/server";

export const APP_ROUTE_CACHE_CONTROL =
  "private, no-store, max-age=0, s-maxage=0, must-revalidate";

// Next 16 renamed Middleware to Proxy. Better Auth handles its own cookies in
// the route handler via nextCookies(); this proxy stays deliberately light and
// must not become the authorization layer.
export function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  // App HTML/RSC/API responses are pilot evidence and may be personalized.
  // Keep them out of intermediary caches even if DNS is proxied later.
  response.headers.set("Cache-Control", APP_ROUTE_CACHE_CONTROL);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|sw.js|manifest.webmanifest).*)",
  ],
};
