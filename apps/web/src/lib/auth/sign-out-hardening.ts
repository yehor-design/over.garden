import { createHash, timingSafeEqual } from "node:crypto";

import { APIError } from "better-auth/api";

export const SIGN_OUT_ADAPTER_FAILURE_CODE = "CURRENT_SESSION_DELETE_FAILED";
export const SIGN_OUT_BINDING_FAILURE_CODE = "CURRENT_SESSION_BINDING_INVALID";
export const CURRENT_SESSION_BINDING_HEADER =
  "x-overgarden-current-session-binding";
export const CURRENT_SESSION_BINDING_LENGTH = 43;

export type SignOutHardeningOutcome =
  | "not_sign_out"
  | "no_current_session"
  | "no_live_current_session"
  | "current_session_predeleted";

interface SignOutHardeningContext {
  path: string;
  getSignedCookie: (
    key: string,
    secret: string,
  ) => Promise<string | false | null>;
  headers?: Headers;
  request?: {
    headers: Headers;
  };
  context: {
    authCookies: {
      sessionToken: {
        name: string;
      };
    };
    secret: string;
    internalAdapter: {
      findSession: (sessionToken: string) => Promise<{
        session: {
          id: unknown;
        };
      } | null>;
      deleteSession: (sessionToken: string) => Promise<unknown>;
    };
  };
}

/**
 * Better Auth 1.6.20 deliberately swallows a session-adapter deletion error in
 * its stock `/sign-out` endpoint and still clears the browser cookie. Pre-delete
 * the exact signed-cookie session through Better Auth's authoritative internal
 * adapter so a storage failure stops dispatch before the stock endpoint can
 * report success or mutate cookies. The stock endpoint then performs the same
 * idempotent delete and remains the canonical response/cookie boundary.
 */
export async function hardenCurrentSessionSignOut(
  context: SignOutHardeningContext,
): Promise<SignOutHardeningOutcome> {
  if (context.path !== "/sign-out") return "not_sign_out";

  let sessionToken: string | false | null;
  try {
    sessionToken = await context.getSignedCookie(
      context.context.authCookies.sessionToken.name,
      context.context.secret,
    );
  } catch {
    throwAdapterFailure();
  }

  if (!sessionToken) return "no_current_session";

  let currentSession: Awaited<
    ReturnType<
      SignOutHardeningContext["context"]["internalAdapter"]["findSession"]
    >
  >;
  try {
    currentSession =
      await context.context.internalAdapter.findSession(sessionToken);
  } catch {
    throwAdapterFailure();
  }

  if (!currentSession) return "no_live_current_session";

  const sessionId = currentSession.session.id;
  if (!isBoundedSessionId(sessionId)) throwAdapterFailure();

  const suppliedBinding = readCurrentSessionBindingHeader(context);
  if (!isCurrentSessionBinding(suppliedBinding)) throwBindingFailure();

  let expectedBinding: string;
  try {
    expectedBinding = deriveServerCurrentSessionBinding(sessionId);
  } catch {
    throwAdapterFailure();
  }
  if (!currentSessionBindingsMatch(suppliedBinding, expectedBinding)) {
    throwBindingFailure();
  }

  try {
    await context.context.internalAdapter.deleteSession(sessionToken);
    return "current_session_predeleted";
  } catch {
    throwAdapterFailure();
  }
}

export function deriveServerCurrentSessionBinding(sessionId: string) {
  if (!isBoundedSessionId(sessionId)) {
    throw new TypeError("A bounded current session id is required.");
  }
  return createHash("sha256").update(sessionId, "utf8").digest("base64url");
}

export function currentSessionBindingsMatch(
  suppliedBinding: string,
  expectedBinding: string,
) {
  if (
    !isCurrentSessionBinding(suppliedBinding) ||
    !isCurrentSessionBinding(expectedBinding)
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(suppliedBinding, "ascii"),
    Buffer.from(expectedBinding, "ascii"),
  );
}

function readCurrentSessionBindingHeader(context: SignOutHardeningContext) {
  return (
    context.headers?.get(CURRENT_SESSION_BINDING_HEADER) ??
    context.request?.headers.get(CURRENT_SESSION_BINDING_HEADER) ??
    null
  );
}

function isCurrentSessionBinding(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === CURRENT_SESSION_BINDING_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function isBoundedSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value
  );
}

function throwAdapterFailure(): never {
  throw APIError.from("INTERNAL_SERVER_ERROR", {
    code: SIGN_OUT_ADAPTER_FAILURE_CODE,
    message: "The current session could not be ended.",
  });
}

function throwBindingFailure(): never {
  throw APIError.from("CONFLICT", {
    code: SIGN_OUT_BINDING_FAILURE_CODE,
    message: "The current session changed. Start sign out again.",
  });
}
