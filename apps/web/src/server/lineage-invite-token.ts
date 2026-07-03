import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const LINEAGE_INVITE_SIGNING_SECRET_ENV =
  "LINEAGE_INVITE_SIGNING_SECRET";
export const DEV_LINEAGE_INVITE_SECRET =
  "development-only-overgarden-lineage-invite-secret-change-before-deploy";

const TOKEN_VERSION = "v1";
const DEFAULT_INVITE_TTL_SECONDS = 30 * 24 * 60 * 60;

interface LineageInvitePayload {
  p: string;
  e: string;
  iat: number;
  exp: number;
}

export interface LineageInviteVerification {
  pendingIdentityId: string;
  edgeId: string;
  expiresAt: number;
}

export interface SignLineageInviteTokenOptions {
  pendingIdentityId: string;
  edgeId: string;
  createdAt: Date | string;
  ttlSeconds?: number;
  secret?: string;
}

export interface VerifyLineageInviteTokenOptions {
  now?: number;
  secret?: string;
}

export function signLineageInviteToken(
  options: SignLineageInviteTokenOptions,
): string {
  const issuedAtSeconds = Math.floor(toTimestamp(options.createdAt) / 1000);
  const ttlSeconds = Math.max(
    1,
    Math.floor(options.ttlSeconds ?? DEFAULT_INVITE_TTL_SECONDS),
  );
  const payload: LineageInvitePayload = {
    p: options.pendingIdentityId,
    e: options.edgeId,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + ttlSeconds,
  };
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(
    `${TOKEN_VERSION}.${body}`,
    resolveLineageInviteSecret(options.secret),
  );

  return `${TOKEN_VERSION}.${body}.${signature}`;
}

export function verifyLineageInviteToken(
  token: string | null | undefined,
  options: VerifyLineageInviteTokenOptions = {},
): LineageInviteVerification | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [version, body, signature] = parts;
  if (version !== TOKEN_VERSION || !body || !signature) return null;

  const expectedSignature = sign(
    `${version}.${body}`,
    resolveLineageInviteSecret(options.secret),
  );
  if (!safeEqual(signature, expectedSignature)) return null;

  const payload = decodePayload(body);
  if (!payload) return null;
  if (!isBoundedTokenId(payload.p) || !isBoundedTokenId(payload.e)) return null;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return null;
  }

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (payload.exp <= nowSeconds) return null;

  return {
    pendingIdentityId: payload.p,
    edgeId: payload.e,
    expiresAt: payload.exp,
  };
}

export function resolveLineageInviteSecret(explicitSecret?: string): string {
  if (explicitSecret && explicitSecret.length > 0) return explicitSecret;
  const lineageSecret = process.env[LINEAGE_INVITE_SIGNING_SECRET_ENV];
  if (lineageSecret && lineageSecret.length > 0) return lineageSecret;
  const authSecret = process.env.BETTER_AUTH_SECRET;
  if (authSecret && authSecret.length > 0) return authSecret;
  return DEV_LINEAGE_INVITE_SECRET;
}

function decodePayload(body: string): LineageInvitePayload | null {
  try {
    const parsed = JSON.parse(
      decodeBase64Url(body).toString("utf8"),
    ) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as LineageInvitePayload;
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

function toTimestamp(value: Date | string): number {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function isBoundedTokenId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 80;
}
