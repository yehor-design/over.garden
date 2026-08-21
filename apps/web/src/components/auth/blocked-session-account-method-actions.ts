"use server";

import {
  deriveCurrentSessionBinding,
  hasCurrentSessionBinding,
} from "@/lib/auth/current-session-binding";
import { recordUnresolvedAuthorizationServe } from "@/lib/auth/unresolved-authorization";
import {
  getCurrentAccountMethodProjection,
  type AccountMethodProjection,
} from "@/server/auth/account-methods";
import { getCurrentSession, getSessionId } from "@/server/auth-session";

export type BlockedSessionAccountMethodsResult =
  | { status: "ready"; methods: AccountMethodProjection }
  | {
      status: "served_unresolved";
      methods: AccountMethodProjection;
      receipt: ReturnType<typeof recordUnresolvedAuthorizationServe>;
    }
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

  let session: Awaited<ReturnType<typeof getCurrentSession>>;
  try {
    session = await getCurrentSession();
  } catch {
    return serveUnresolvedAccountMethodsWithProjection();
  }
  const sessionId = getSessionId(session);
  if (!sessionId) return { status: "unavailable" };

  let currentBinding: string;
  try {
    currentBinding = await deriveCurrentSessionBinding(sessionId);
  } catch {
    return serveUnresolvedAccountMethodsWithProjection();
  }
  if (currentBinding !== expectedSessionBinding) {
    return { status: "unavailable" };
  }

  try {
    return {
      status: "ready",
      methods: await getCurrentAccountMethodProjection(),
    };
  } catch {
    return serveUnresolvedAccountMethods(retryProjection());
  }
}

async function serveUnresolvedAccountMethodsWithProjection() {
  let methods: AccountMethodProjection;
  try {
    methods = await getCurrentAccountMethodProjection();
  } catch {
    methods = retryProjection();
  }
  return serveUnresolvedAccountMethods(methods);
}

function serveUnresolvedAccountMethods(
  methods: AccountMethodProjection,
): BlockedSessionAccountMethodsResult {
  return {
    status: "served_unresolved",
    methods,
    receipt: recordUnresolvedAuthorizationServe(
      "account_methods",
      "ownership_unresolved",
    ),
  };
}

function retryProjection(): AccountMethodProjection {
  return {
    readbackState: "retry",
    hasCredential: false,
    hasGoogle: false,
    canSetPassword: false,
    canLinkGoogle: false,
  };
}
