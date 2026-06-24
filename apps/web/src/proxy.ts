import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed Middleware to Proxy (same functionality). This refreshes the
// Supabase auth session on navigations so RSCs read a valid session. It is an
// optimistic refresh only — real authorization lives in the server-tier data
// layer (Variant D), not here.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on everything except static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|sw.js|manifest.webmanifest).*)",
  ],
};
