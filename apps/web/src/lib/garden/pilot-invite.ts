// Signed closed-pilot invite tokens for OVE-42.
//
// The token is the ONLY thing a founder shares to grant write access. It is an
// HMAC-SHA256-signed, time-bound carrier of enum cohort + segment metadata and
// nothing else: no email, phone, name, IP, referrer, raw URL, or query string.
// Verification is pure (only `node:crypto` + an env/explicit secret), so this
// module is safe to import from both Next.js server code and the standalone
// founder CLI without a `server-only` boundary.

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  DEFAULT_PILOT_SEGMENT,
  isPilotSegment,
  type PilotSegment,
} from "@/lib/pilot/segments";

export const PILOT_INVITE_COHORTS = ["closed_pilot"] as const;
export type PilotInviteCohort = (typeof PILOT_INVITE_COHORTS)[number];
export const DEFAULT_PILOT_INVITE_COHORT: PilotInviteCohort = "closed_pilot";

export const PILOT_INVITE_SIGNING_SECRET_ENV = "PILOT_INVITE_SIGNING_SECRET";

// Development-only fallback so local `/join` works without extra setup. It is a
// public, intentionally weak constant; production MUST set a real secret. The
// pilot smoke readiness check fails when this fallback would be used on deploy.
export const DEV_PILOT_INVITE_SECRET =
  "development-only-overgarden-pilot-invite-secret-change-before-deploy";

const TOKEN_VERSION = "v1";
const DEFAULT_INVITE_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days.

interface PilotInvitePayload {
  c: PilotInviteCohort;
  s?: PilotSegment;
  iat: number;
  exp: number;
}

export interface PilotInviteVerification {
  cohort: PilotInviteCohort;
  segment: PilotSegment;
  expiresAt: number;
}

export interface SignPilotInviteOptions {
  cohort?: PilotInviteCohort;
  segment?: PilotSegment;
  ttlSeconds?: number;
  now?: number;
  secret?: string;
}

export interface VerifyPilotInviteOptions {
  now?: number;
  secret?: string;
}

export function isPilotInviteCohort(
  value: unknown,
): value is PilotInviteCohort {
  return (
    typeof value === "string" &&
    (PILOT_INVITE_COHORTS as readonly string[]).includes(value)
  );
}

export function resolvePilotInviteSecret(explicitSecret?: string): string {
  if (explicitSecret && explicitSecret.length > 0) return explicitSecret;
  const fromEnv = process.env[PILOT_INVITE_SIGNING_SECRET_ENV];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return DEV_PILOT_INVITE_SECRET;
}

export function isUsingDevPilotInviteSecret(explicitSecret?: string): boolean {
  return resolvePilotInviteSecret(explicitSecret) === DEV_PILOT_INVITE_SECRET;
}

export function signPilotInviteToken(
  options: SignPilotInviteOptions = {},
): string {
  const cohort = options.cohort ?? DEFAULT_PILOT_INVITE_COHORT;
  const segment = options.segment ?? DEFAULT_PILOT_SEGMENT;
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const ttlSeconds = Math.max(
    1,
    Math.floor(options.ttlSeconds ?? DEFAULT_INVITE_TTL_SECONDS),
  );
  const payload: PilotInvitePayload = {
    c: cohort,
    s: segment,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  };
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(
    `${TOKEN_VERSION}.${body}`,
    resolvePilotInviteSecret(options.secret),
  );
  return `${TOKEN_VERSION}.${body}.${signature}`;
}

export function verifyPilotInviteToken(
  token: string | null | undefined,
  options: VerifyPilotInviteOptions = {},
): PilotInviteVerification | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [version, body, signature] = parts;
  if (version !== TOKEN_VERSION || !body || !signature) return null;

  const expectedSignature = sign(
    `${version}.${body}`,
    resolvePilotInviteSecret(options.secret),
  );
  if (!safeEqual(signature, expectedSignature)) return null;

  const payload = decodePayload(body);
  if (!payload) return null;
  if (!isPilotInviteCohort(payload.c)) return null;
  const segment =
    payload.s === undefined || payload.s === null
      ? DEFAULT_PILOT_SEGMENT
      : isPilotSegment(payload.s)
        ? payload.s
        : null;
  if (!segment) return null;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return null;
  }

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (payload.exp <= nowSeconds) return null;

  return { cohort: payload.c, segment, expiresAt: payload.exp };
}

function decodePayload(body: string): PilotInvitePayload | null {
  try {
    const parsed = JSON.parse(
      decodeBase64Url(body).toString("utf8"),
    ) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as PilotInvitePayload;
  } catch {
    return null;
  }
}

function sign(data: string, secret: string): string {
  return encodeBase64Url(createHmac("sha256", secret).update(data).digest());
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

function encodeBase64Url(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer.toString("base64url");
}

function decodeBase64Url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}
