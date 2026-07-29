import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  type AuthSecretConfiguration,
  resolveAuthSecretConfiguration,
  selectLegacyAuthSecret,
  selectVersionedAuthSecret,
} from "@/lib/auth-secret";

export const LINEAGE_INVITE_SIGNING_SECRET_ENV =
  "LINEAGE_INVITE_SIGNING_SECRET";

const LEGACY_TOKEN_VERSION = "v1";
const CURRENT_TOKEN_VERSION = "v2";
const DEFAULT_INVITE_TTL_SECONDS = 30 * 24 * 60 * 60;
const VERSION_PATTERN = /^(0|[1-9]\d*)$/;

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
  /** Test or separately managed lineage signing material. */
  secret?: string;
  authSecrets?: AuthSecretConfiguration;
}

export interface VerifyLineageInviteTokenOptions {
  now?: number;
  secret?: string;
  authSecrets?: AuthSecretConfiguration;
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
  const writer = resolveWriter(options);
  const version =
    writer.version === null ? LEGACY_TOKEN_VERSION : CURRENT_TOKEN_VERSION;
  const signed = [
    version,
    ...(writer.version === null ? [] : [String(writer.version)]),
    body,
  ].join(".");

  return `${signed}.${sign(signed, writer.secret)}`;
}

export function verifyLineageInviteToken(
  token: string | null | undefined,
  options: VerifyLineageInviteTokenOptions = {},
): LineageInviteVerification | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  const isLegacy = parts.length === 3 && parts[0] === LEGACY_TOKEN_VERSION;
  const isCurrent = parts.length === 4 && parts[0] === CURRENT_TOKEN_VERSION;
  if (!isLegacy && !isCurrent) return null;

  const keyVersion = isCurrent ? parseVersion(parts[1]!) : null;
  if (isCurrent && keyVersion === null) return null;
  const body = parts[isCurrent ? 2 : 1];
  const signature = parts[isCurrent ? 3 : 2];
  if (!body || !signature || !/^[A-Za-z0-9_-]+$/.test(body)) return null;

  const secret =
    keyVersion === null
      ? resolveLegacySecret(options)
      : selectVersionedAuthSecret(
          keyVersion,
          options.authSecrets ?? resolveAuthSecretConfiguration(),
        )?.value;
  if (!secret) return null;

  const signed = parts.slice(0, isCurrent ? 3 : 2).join(".");
  const expectedSignature = sign(signed, secret);
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

/**
 * Returns independently managed lineage material only. Falling back to a
 * Better Auth key is handled by the version-aware writer/reader above; there
 * is no production development constant.
 */
export function resolveLineageInviteSecret(
  explicitSecret?: string,
): string | null {
  if (explicitSecret && explicitSecret.length > 0) return explicitSecret;
  const lineageSecret = process.env[LINEAGE_INVITE_SIGNING_SECRET_ENV];
  return lineageSecret && lineageSecret.length > 0 ? lineageSecret : null;
}

function resolveWriter(options: SignLineageInviteTokenOptions) {
  const dedicatedSecret = resolveLineageInviteSecret(options.secret);
  if (dedicatedSecret) return { version: null, secret: dedicatedSecret };
  const configuration = options.authSecrets ?? resolveAuthSecretConfiguration();
  if (configuration.health.class === "legacy_transition") {
    return { version: null, secret: configuration.active.value };
  }
  return {
    version: configuration.active.version,
    secret: configuration.active.value,
  };
}

function resolveLegacySecret(options: VerifyLineageInviteTokenOptions) {
  return (
    resolveLineageInviteSecret(options.secret) ??
    selectLegacyAuthSecret(
      options.authSecrets ?? resolveAuthSecretConfiguration(),
    )
  );
}

function parseVersion(value: string): number | null {
  if (!VERSION_PATTERN.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) && version >= 0 ? version : null;
}

function decodePayload(body: string): LineageInvitePayload | null {
  try {
    const decoded = decodeBase64Url(body);
    if (decoded.toString("base64url") !== body) return null;
    const parsed = JSON.parse(decoded.toString("utf8")) as unknown;
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
