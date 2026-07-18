"use client";

import { authClient } from "@/lib/auth-client";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { localizedPath } from "@/lib/public-localization";

export const CURRENT_SESSION_BINDING_HEADER =
  "x-overgarden-current-session-binding";
const CURRENT_SESSION_BINDING_LENGTH = 43;

export interface PreparedCurrentSessionSignOut {
  readonly version: 1;
  readonly binding: string;
}

export interface CurrentSessionSignOutRequestOptions {
  fetchOptions: {
    headers: Record<typeof CURRENT_SESSION_BINDING_HEADER, string>;
  };
}

export interface CurrentSessionConfirmationClient {
  getSession: (
    options: AuthoritativeSessionConfirmationOptions,
  ) => Promise<unknown>;
}

export interface CurrentSessionSignOutClient extends CurrentSessionConfirmationClient {
  signOut: (options: CurrentSessionSignOutRequestOptions) => Promise<unknown>;
}

export const AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS = {
  query: { disableCookieCache: true },
  fetchOptions: { cache: "no-store" },
} as const;

export type AuthoritativeSessionConfirmationOptions =
  typeof AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS;

export type ConfirmedSignOutResult =
  | {
      status: "committed";
      reconciliation: "canonical_response" | "confirmed_after_transport_error";
    }
  | {
      status: "failed";
      reason:
        | "session_still_active"
        | "session_changed"
        | "session_confirmation_unavailable";
    };

export function localizedPublicRoot(locale: InterfaceLocale) {
  return localizedPath(locale, "/");
}

export async function prepareCurrentSessionSignOut(
  freshSessionResult: unknown,
): Promise<PreparedCurrentSessionSignOut | null> {
  const sessionId = readFreshCurrentSessionId(freshSessionResult);
  if (sessionId === null) return null;

  return Object.freeze({
    version: 1,
    binding: await deriveCurrentSessionBinding(sessionId),
  });
}

export async function deriveCurrentSessionBinding(sessionId: string) {
  if (!isBoundedSessionId(sessionId)) {
    throw new TypeError("A bounded current session id is required.");
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error("Current session binding is unavailable.");
  }

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sessionId),
  );
  return encodeBase64Url(new Uint8Array(digest));
}

export type PreparedCurrentSessionConfirmation =
  | { status: "matches" }
  | { status: "changed" }
  | { status: "signed_out" }
  | { status: "unavailable" };

export async function confirmPreparedCurrentSession(
  preparedCurrentSession: PreparedCurrentSessionSignOut,
  client: CurrentSessionConfirmationClient = CANONICAL_AUTH_CLIENT,
): Promise<PreparedCurrentSessionConfirmation> {
  if (!isPreparedCurrentSessionSignOut(preparedCurrentSession)) {
    return { status: "unavailable" };
  }

  let freshSessionResult: unknown;
  try {
    freshSessionResult = await client.getSession(
      AUTHORITATIVE_SESSION_CONFIRMATION_OPTIONS,
    );
  } catch {
    return { status: "unavailable" };
  }

  let currentSessionId: string | null;
  try {
    currentSessionId = readFreshCurrentSessionId(freshSessionResult);
  } catch {
    return { status: "unavailable" };
  }
  if (currentSessionId === null) return { status: "signed_out" };

  let currentBinding: string;
  try {
    currentBinding = await deriveCurrentSessionBinding(currentSessionId);
  } catch {
    return { status: "unavailable" };
  }

  return currentBinding === preparedCurrentSession.binding
    ? { status: "matches" }
    : { status: "changed" };
}

export async function signOutCurrentSessionOnce(
  preparedCurrentSession: PreparedCurrentSessionSignOut,
  client: CurrentSessionSignOutClient = CANONICAL_AUTH_CLIENT,
): Promise<ConfirmedSignOutResult> {
  if (!isPreparedCurrentSessionSignOut(preparedCurrentSession)) {
    return {
      status: "failed",
      reason: "session_confirmation_unavailable",
    };
  }

  const beforeRequest = await confirmPreparedCurrentSession(
    preparedCurrentSession,
    client,
  );
  if (beforeRequest.status === "changed") {
    return { status: "failed", reason: "session_changed" };
  }
  if (beforeRequest.status === "unavailable") {
    return {
      status: "failed",
      reason: "session_confirmation_unavailable",
    };
  }

  let transportConfirmed = false;

  try {
    const response = await client.signOut(
      createBoundSignOutRequest(preparedCurrentSession),
    );
    transportConfirmed = isSuccessfulSignOutResponse(response);
  } catch {
    transportConfirmed = false;
  }

  const afterRequest = await confirmPreparedCurrentSession(
    preparedCurrentSession,
    client,
  );
  if (afterRequest.status === "unavailable") {
    return {
      status: "failed",
      reason: "session_confirmation_unavailable",
    };
  }
  if (afterRequest.status === "signed_out") {
    return {
      status: "committed",
      reconciliation: transportConfirmed
        ? "canonical_response"
        : "confirmed_after_transport_error",
    };
  }
  if (afterRequest.status === "changed") {
    return { status: "failed", reason: "session_changed" };
  }
  if (afterRequest.status === "matches") {
    return { status: "failed", reason: "session_still_active" };
  }

  return {
    status: "failed",
    reason: "session_confirmation_unavailable",
  };
}

export function classifySessionConfirmation(
  result: unknown,
): "signed_out" | "authenticated" | "unknown" {
  if (result === null) return "signed_out";
  if (!isRecord(result)) return "unknown";

  if ("error" in result && result.error != null) return "unknown";
  if (!("data" in result)) return "unknown";

  const data = result.data;
  if (data === null) return "signed_out";
  if (!isRecord(data)) return "unknown";
  if (data.session === null && data.user === null) return "signed_out";
  if (isRecord(data.session) || isRecord(data.user)) return "authenticated";

  return "unknown";
}

function isSuccessfulSignOutResponse(result: unknown) {
  if (!isRecord(result)) return false;
  if ("error" in result && result.error != null) return false;
  if (!("data" in result) || !isRecord(result.data)) return false;
  return result.data.success === true;
}

function readFreshCurrentSessionId(result: unknown): string | null {
  if (result === null) return null;
  if (!isRecord(result)) throwSessionPreparationFailure();
  if ("error" in result && result.error != null) {
    throwSessionPreparationFailure();
  }
  if (!("data" in result)) throwSessionPreparationFailure();

  const data = result.data;
  if (data === null) return null;
  if (!isRecord(data)) throwSessionPreparationFailure();
  if (data.session === null && data.user === null) return null;
  if (!isRecord(data.session)) throwSessionPreparationFailure();

  const sessionId = data.session.id;
  if (!isBoundedSessionId(sessionId)) throwSessionPreparationFailure();
  return sessionId;
}

function createBoundSignOutRequest(
  preparedCurrentSession: PreparedCurrentSessionSignOut,
): CurrentSessionSignOutRequestOptions {
  return {
    fetchOptions: {
      headers: {
        [CURRENT_SESSION_BINDING_HEADER]: preparedCurrentSession.binding,
      },
    },
  };
}

function isPreparedCurrentSessionSignOut(
  value: unknown,
): value is PreparedCurrentSessionSignOut {
  if (!isRecord(value) || value.version !== 1) return false;
  return (
    typeof value.binding === "string" &&
    value.binding.length === CURRENT_SESSION_BINDING_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value.binding)
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

function encodeBase64Url(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let encoded = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const value =
      (first << 16) | ((second ?? 0) << 8) | (third === undefined ? 0 : third);

    encoded += alphabet[(value >>> 18) & 63];
    encoded += alphabet[(value >>> 12) & 63];
    if (second !== undefined) encoded += alphabet[(value >>> 6) & 63];
    if (third !== undefined) encoded += alphabet[value & 63];
  }

  return encoded;
}

function throwSessionPreparationFailure(): never {
  throw new Error("The current session could not be prepared for sign out.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const CANONICAL_AUTH_CLIENT: CurrentSessionSignOutClient = {
  signOut: (options) => authClient.signOut(options),
  getSession: (options) => authClient.getSession(options),
};
