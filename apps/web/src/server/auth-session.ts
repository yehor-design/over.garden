import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { isRetiredSharedIdentityEmail } from "@/lib/auth/retired-shared-identity";
import { scopedToUser, type RequestScope } from "@/server/request-scope";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication is required for this action.");
    this.name = "AuthenticationRequiredError";
  }
}

export async function getCurrentSession() {
  return readCurrentSession(false);
}

/**
 * Sensitive mutation admission must bypass Better Auth's cookie cache. The
 * returned object is the one request snapshot used to derive repository scope.
 */
export async function getAuthoritativeCurrentSession() {
  return readCurrentSession(true);
}

async function readCurrentSession(disableCookieCache: boolean) {
  const requestHeaders = await headers();
  const session = disableCookieCache
    ? await auth.api.getSession({
        headers: requestHeaders,
        query: { disableCookieCache: true },
      })
    : await auth.api.getSession({ headers: requestHeaders });
  const email = session?.user.email;

  if (typeof email === "string" && isRetiredSharedIdentityEmail(email)) {
    return null;
  }

  return session;
}

export async function requireCurrentRequestScope(): Promise<RequestScope> {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    throw new AuthenticationRequiredError();
  }

  return scopedToUser(userId, getSessionId(session));
}

export async function requireCurrentUserId(): Promise<string> {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    throw new AuthenticationRequiredError();
  }

  return userId;
}

export function getSessionId(
  session: Awaited<ReturnType<typeof getCurrentSession>>,
): string | null {
  const sessionId = session?.session?.id;
  return typeof sessionId === "string" ? sessionId : null;
}
