"use server";

import {
  deriveCurrentSessionBinding,
  hasCurrentSessionBinding,
} from "@/lib/auth/current-session-binding";
import {
  getCurrentAccountMethodProjection,
  type AccountMethodProjection,
} from "@/server/auth/account-methods";
import { getCurrentSession, getSessionId } from "@/server/auth-session";

export type BlockedSessionAccountMethodsResult =
  | { status: "ready"; methods: AccountMethodProjection }
  | { status: "unavailable" };

/**
 * This action deliberately returns no account or garden identity. The browser
 * binding makes an explicit guarded-screen gesture fail closed if the current
 * request is no longer the session that initiated it.
 */
export async function getBlockedSessionAccountMethods(
  expectedSessionBinding: string,
): Promise<BlockedSessionAccountMethodsResult> {
  if (!hasCurrentSessionBinding(expectedSessionBinding)) {
    return { status: "unavailable" };
  }

  try {
    const session = await getCurrentSession();
    const sessionId = getSessionId(session);
    if (!sessionId) return { status: "unavailable" };

    const currentBinding = await deriveCurrentSessionBinding(sessionId);
    if (currentBinding !== expectedSessionBinding) {
      return { status: "unavailable" };
    }

    return {
      status: "ready",
      methods: await getCurrentAccountMethodProjection(),
    };
  } catch {
    return { status: "unavailable" };
  }
}
