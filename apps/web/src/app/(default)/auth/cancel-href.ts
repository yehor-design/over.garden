import "server-only";

import {
  AuthIntentTokenError,
  verifyAuthIntentToken,
} from "@/server/auth-intent-token";

const RESUME_PATH = "/auth/intent/resume";

/**
 * Where "back to reading" goes from the sign-in screen (`OVE-504`).
 *
 * Usually `next` itself: the page the reader was on. But a held action's
 * `next` is the route that resumes it, and following that without a session
 * sends the reader straight back to this screen — "back" was a loop for every
 * guest who pressed comment, save or follow. The token names the page the
 * action was pressed on, so that is where back goes, expired or not; a token
 * that does not verify at all goes home.
 */
export function resolveAuthCancelHref(next: string): string {
  const url = new URL(next, "https://over.garden");
  if (url.pathname === RESUME_PATH) {
    const token = url.searchParams.get("intent") ?? "";
    try {
      return verifyAuthIntentToken(token).returnTo;
    } catch (error) {
      if (error instanceof AuthIntentTokenError && error.intent) {
        return error.intent.returnTo;
      }
      return "/";
    }
  }
  return url.pathname.startsWith("/auth/") ? "/" : next;
}
