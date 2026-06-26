import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { scopedToUser, type RequestScope } from "@/server/request-scope";

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireCurrentRequestScope(): Promise<RequestScope> {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("Authentication is required for this action.");
  }

  return scopedToUser(userId, getSessionId(session));
}

export async function requireCurrentUserId(): Promise<string> {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("Authentication is required for this action.");
  }

  return userId;
}

export function getSessionId(
  session: Awaited<ReturnType<typeof getCurrentSession>>,
): string | null {
  const sessionId = session?.session?.id;
  return typeof sessionId === "string" ? sessionId : null;
}
