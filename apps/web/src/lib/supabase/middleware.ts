import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and writes the rotated
 * cookies onto the response. Invoked from `src/proxy.ts` (Next 16's renamed
 * middleware entrypoint).
 *
 * IMPORTANT: this calls `getClaims()` (signature-verified) — never
 * `getSession()` server-side, which is not revalidated. Keep the logic between
 * client creation and the auth call minimal to avoid hard-to-debug session bugs.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Supabase is wired later — with no config there is no session to refresh.
  // Short-circuit so the app serves normally in the meantime.
  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touch the auth server so expired tokens get refreshed onto `response`.
  // Best-effort: a transient auth/network error must not 500 every route.
  try {
    await supabase.auth.getClaims();
  } catch {
    // Swallowed deliberately — real authz is in the server-tier data layer.
  }

  return response;
}
