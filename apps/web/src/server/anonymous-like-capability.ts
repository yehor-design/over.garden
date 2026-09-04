import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  type AuthSecretConfiguration,
  resolveAuthSecretConfiguration,
  selectVersionedAuthSecret,
} from "@/lib/auth-secret";

const TOKEN_VERSION = "v1";
export const ANONYMOUS_LIKE_CAPABILITY_TTL_SECONDS = 24 * 60 * 60;

/**
 * The one bound every consumer of a capability token shares.
 *
 * The payload carries `target_ref` verbatim, and that column admits 160
 * characters of any script. A Cyrillic slug is two UTF-8 bytes per letter and
 * base64url adds a third on top, so a token this server itself minted routinely
 * passes 256 characters — which is what `hashAnonymousEngagementToken` used to
 * reject, turning a like into an empty 500 on 7 of the 8 public journal entries
 * (measured 2026-09-04). The honest invariant is "this server minted it", and
 * the signature proves that; the length check is only a cheap input guard, so
 * both readers now use the same generous bound and cannot drift apart again.
 */
export const MAX_ANONYMOUS_LIKE_CAPABILITY_TOKEN_LENGTH = 1_200;

type LikeTarget = {
  kind: "journal_entry" | "lineage_object" | "variety" | "topic";
  ref: string;
};

interface AnonymousLikeCapabilityPayload {
  k: LikeTarget["kind"];
  r: string;
  n: string;
  iat: number;
  exp: number;
}

export interface AnonymousLikeCapability {
  token: string;
  expiresAt: Date;
}

export function issueAnonymousLikeCapability(
  target: LikeTarget,
  options: { now?: Date; authSecrets?: AuthSecretConfiguration } = {},
): AnonymousLikeCapability {
  const now = options.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const configuration = options.authSecrets ?? resolveAuthSecretConfiguration();
  const payload: AnonymousLikeCapabilityPayload = {
    k: target.kind,
    r: target.ref,
    n: randomBytes(18).toString("base64url"),
    iat: issuedAt,
    exp: issuedAt + ANONYMOUS_LIKE_CAPABILITY_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signed = `${TOKEN_VERSION}.${configuration.active.version}.${body}`;
  return {
    token: `${signed}.${sign(signed, configuration.active.value)}`,
    expiresAt: new Date(payload.exp * 1000),
  };
}

export function verifyAnonymousLikeCapability(
  token: string | undefined,
  target: LikeTarget,
  options: { now?: Date; authSecrets?: AuthSecretConfiguration } = {},
): AnonymousLikeCapability | null {
  if (!token || token.length > MAX_ANONYMOUS_LIKE_CAPABILITY_TOKEN_LENGTH) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return null;
  const version = parseVersion(parts[1]);
  const [body, signature] = [parts[2], parts[3]];
  if (
    version === null ||
    !body ||
    !signature ||
    !/^[A-Za-z0-9_-]+$/.test(body)
  ) {
    return null;
  }
  const configuration = options.authSecrets ?? resolveAuthSecretConfiguration();
  const secret = selectVersionedAuthSecret(version, configuration)?.value;
  if (
    !secret ||
    !safeEqual(signature, sign(`${TOKEN_VERSION}.${version}.${body}`, secret))
  ) {
    return null;
  }
  const payload = decodePayload(body);
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (
    !payload ||
    payload.k !== target.kind ||
    payload.r !== target.ref ||
    payload.exp <= nowSeconds ||
    payload.iat > nowSeconds ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(payload.n)
  ) {
    return null;
  }
  return { token, expiresAt: new Date(payload.exp * 1000) };
}

export function capabilityCookieName(target: LikeTarget) {
  const suffix = createHash("sha256")
    .update(`overgarden:anonymous-like-cookie:v1:${target.kind}:${target.ref}`)
    .digest("base64url")
    .slice(0, 20);
  return `og_like_${suffix}`;
}

function parseVersion(value: string | undefined) {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function decodePayload(body: string): AnonymousLikeCapabilityPayload | null {
  try {
    const decoded = Buffer.from(body, "base64url");
    if (decoded.toString("base64url") !== body) return null;
    const value = JSON.parse(decoded.toString("utf8")) as unknown;
    if (!value || typeof value !== "object") return null;
    const payload = value as Partial<AnonymousLikeCapabilityPayload>;
    if (
      (payload.k !== "journal_entry" &&
        payload.k !== "lineage_object" &&
        payload.k !== "variety" &&
        payload.k !== "topic") ||
      typeof payload.r !== "string" ||
      payload.r.length < 1 ||
      payload.r.length > 160 ||
      typeof payload.n !== "string" ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp)
    ) {
      return null;
    }
    return payload as AnonymousLikeCapabilityPayload;
  } catch {
    return null;
  }
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
