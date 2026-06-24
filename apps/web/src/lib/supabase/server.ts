import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase server client for RSCs, route handlers, and server actions.
 *
 * `cookies()` is ASYNC in Next 16, so this factory is async and must be awaited.
 * Only `getAll`/`setAll` are supported by @supabase/ssr 0.12 (the old
 * get/set/remove are removed). `setAll` is wrapped in try/catch because it is a
 * no-op error when called from a read-only Server Component — the proxy
 * (`src/proxy.ts`) performs the actual session refresh.
 *
 * Used for AUTH only. Data access goes through the Drizzle server-tier
 * repositories (Variant D), never the Supabase data API from the browser.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; the proxy
            // refreshes the session on the response.
          }
        },
      },
    },
  );
}
