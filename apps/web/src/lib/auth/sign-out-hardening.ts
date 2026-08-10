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

export type CurrentSessionExitOutcome =
  | "revoked_confirmed"
  | "unconfirmed"
  | "stale_operation";

export interface BetterAuthSignOutEndpoint {
  (context: { headers: Headers; asResponse: true }): Promise<Response>;
}

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

/**
 * Run Better Auth's canonical sign-out while keeping exact server revocation
 * and browser cookie expiry as separate facts. Better Auth deliberately omits
 * its expiry cookie when our pre-delete hook throws; a second credential-free
 * canonical call supplies the library-owned expiry attributes without reading
 * or deleting any session. A binding conflict is the closed A-to-B race class
 * and must never emit a cookie mutation.
 */
export async function executeCurrentSessionExit(
  requestHeaders: Headers,
  signOut: BetterAuthSignOutEndpoint,
): Promise<{ response: Response; outcome: CurrentSessionExitOutcome }> {
  let response: Response;
  try {
    response = await signOut({
      headers: new Headers(requestHeaders),
      asResponse: true,
    });
  } catch (error) {
    const boundedFailure = boundedCurrentSessionExitFailure(error);
    if (!boundedFailure) {
      return {
        response: new Response(null, { status: 500 }),
        outcome: "unconfirmed",
      };
    }
    response = boundedFailure.response;
    if (boundedFailure.code === SIGN_OUT_BINDING_FAILURE_CODE) {
      return { response, outcome: "stale_operation" };
    }
  }

  const responseCode = await readBoundedResponseCode(response);
  if (responseCode === SIGN_OUT_BINDING_FAILURE_CODE) {
    return { response, outcome: "stale_operation" };
  }

  const outcome = response.ok ? "revoked_confirmed" : "unconfirmed";
  if (readSetCookieHeaders(response.headers).length > 0) {
    return { response, outcome };
  }
  if (responseCode !== SIGN_OUT_ADAPTER_FAILURE_CODE && !response.ok) {
    return { response, outcome };
  }

  const expiryHeaders = new Headers(requestHeaders);
  expiryHeaders.delete("cookie");
  expiryHeaders.delete(CURRENT_SESSION_BINDING_HEADER);
  let expiryResponse: Response;
  try {
    expiryResponse = await signOut({
      headers: expiryHeaders,
      asResponse: true,
    });
  } catch {
    return { response, outcome };
  }
  const expiryCookies = readSetCookieHeaders(expiryResponse.headers);
  if (expiryCookies.length === 0) return { response, outcome };

  const headers = new Headers(response.headers);
  for (const cookie of expiryCookies) headers.append("set-cookie", cookie);
  return {
    response: new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
    outcome,
  };
}

function boundedCurrentSessionExitFailure(error: unknown): {
  code:
    | typeof SIGN_OUT_ADAPTER_FAILURE_CODE
    | typeof SIGN_OUT_BINDING_FAILURE_CODE;
  response: Response;
} | null {
  if (!(error instanceof APIError)) return null;
  const code = error.body?.code;
  if (
    code !== SIGN_OUT_ADAPTER_FAILURE_CODE &&
    code !== SIGN_OUT_BINDING_FAILURE_CODE
  ) {
    return null;
  }
  return {
    code,
    response: Response.json(
      { code },
      {
        status: error.statusCode,
        headers: { "cache-control": "private, no-store" },
      },
    ),
  };
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

async function readBoundedResponseCode(response: Response) {
  try {
    const value = (await response.clone().json()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const record = value as Record<string, unknown>;
    if (typeof record.code === "string") return record.code;
    const error = record.error;
    if (!error || typeof error !== "object" || Array.isArray(error))
      return null;
    const nestedCode = (error as Record<string, unknown>).code;
    return typeof nestedCode === "string" ? nestedCode : null;
  } catch {
    return null;
  }
}

export function readSetCookieHeaders(headers: Headers): string[] {
  const getSetCookie = (
    headers as Headers & {
      getSetCookie?: () => string[];
    }
  ).getSetCookie;
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers).filter(Boolean);
  }
  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
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
