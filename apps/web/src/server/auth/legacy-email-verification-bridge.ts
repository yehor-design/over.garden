import "server-only";

import { signJWT, verifyJWT } from "better-auth/crypto";

import {
  type AuthSecretConfiguration,
  resolveAuthSecretConfiguration,
  selectLegacyAuthSecret,
} from "@/lib/auth-secret";

const VERIFY_EMAIL_PATH = "/api/auth/verify-email";
const MAX_EMAIL_LENGTH = 320;
const ALLOWED_REQUEST_TYPES = new Set([
  "change-email-confirmation",
  "change-email-verification",
]);

/**
 * Better Auth 1.6.25 directs encrypted OAuth/session envelopes through its
 * versioned `secretConfig`, but email-verification JWTs are signed with the
 * active raw key. During the one legacy grace window, re-sign a valid legacy
 * verification token with the active key before delegating to Better Auth.
 *
 * This is not a permissive verifier: it accepts only the one configured
 * legacy key, preserves the original expiry ceiling, accepts the documented
 * verification payload fields, and never logs or serializes token material.
 */
export async function bridgeLegacyEmailVerificationRequest(
  request: Request,
  configuration: AuthSecretConfiguration = resolveAuthSecretConfiguration(),
): Promise<Request> {
  if (
    request.method !== "GET" ||
    configuration.health.class !== "versioned_current"
  ) {
    return request;
  }

  const url = new URL(request.url);
  if (!url.pathname.endsWith(VERIFY_EMAIL_PATH)) return request;

  const legacySecret = selectLegacyAuthSecret(configuration);
  const token = url.searchParams.get("token");
  if (!legacySecret || !token || !hasBetterAuthHs256Header(token))
    return request;

  const payload = await verifyJWT(token, legacySecret);
  const bridgedPayload = normalizeVerificationPayload(payload);
  const expiresAt = numericClaim(payload?.exp);
  const remainingSeconds =
    expiresAt === null ? 0 : Math.floor(expiresAt - Date.now() / 1000);
  if (!bridgedPayload || remainingSeconds < 1) return request;

  const activeToken = await signJWT(
    bridgedPayload,
    configuration.active.value,
    remainingSeconds,
  );
  url.searchParams.set("token", activeToken);
  return new Request(url, request);
}

function normalizeVerificationPayload(payload: Record<string, unknown> | null) {
  if (!payload) return null;
  const email = normalizeEmail(payload.email);
  const updateTo =
    payload.updateTo === undefined
      ? undefined
      : normalizeEmail(payload.updateTo);
  if (!email || (payload.updateTo !== undefined && !updateTo)) return null;

  const requestType =
    payload.requestType === undefined
      ? undefined
      : typeof payload.requestType === "string" &&
          ALLOWED_REQUEST_TYPES.has(payload.requestType)
        ? payload.requestType
        : null;
  if (requestType === null) return null;

  return {
    email,
    ...(updateTo ? { updateTo } : {}),
    ...(requestType ? { requestType } : {}),
  };
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 2 && normalized.length <= MAX_EMAIL_LENGTH
    ? normalized
    : null;
}

function numericClaim(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasBetterAuthHs256Header(token: string): boolean {
  const [header, payload, signature, extra] = token.split(".");
  if (!header || !payload || !signature || extra !== undefined) return false;
  try {
    const parsed = JSON.parse(
      Buffer.from(header, "base64url").toString("utf8"),
    ) as { alg?: unknown };
    return parsed.alg === "HS256";
  } catch {
    return false;
  }
}
