import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client — for AUTH UI only (sign-in/up flows added later).
 *
 * It uses the publishable key, which respects RLS. The browser must NOT use this
 * (or any client) to read application tables directly — all data access flows
 * through the server tier (Variant D / single-door invariant). The only
 * client-side Supabase surfaces allowed later are: signed upload URLs and
 * Broadcast-from-Database realtime channels.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
