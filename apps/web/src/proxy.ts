import { NextResponse, type NextRequest } from "next/server";

// Next 16 renamed Middleware to Proxy. Better Auth handles its own cookies in
// the route handler via nextCookies(); this proxy stays deliberately light and
// must not become the authorization layer.
export function proxy(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|sw.js|manifest.webmanifest).*)",
  ],
};
