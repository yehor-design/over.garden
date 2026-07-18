import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

import { resolveBetterAuthSecret } from "@/lib/auth-secret";

const TOKEN_VERSION = "v1";
const PAYLOAD_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const CONTEXT = "overgarden.public-handle-mention-target.v1";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const MAX_CIPHERTEXT_LENGTH_BYTES = 64;

/**
 * Must remain within the browser-safe mention selection contract. The current
 * fixed payload produces a 110-character token.
 */
export const PUBLIC_HANDLE_MENTION_TOKEN_MAX_LENGTH = 120;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PublicHandleMentionTokenOptions {
  audienceUserId: string;
  secret?: string;
}

interface PublicHandleMentionPayload {
  v: typeof PAYLOAD_VERSION;
  t: string;
}

/**
 * Produces a self-contained, non-expiring selection token for an authenticated
 * viewer. The Better Auth user id remains server-only; the token can survive a
 * handle rename and an offline draft without creating a token registry.
 */
export function sealPublicHandleMentionTarget(
  targetUserId: string,
  options: PublicHandleMentionTokenOptions,
): string {
  const target = normalizeUuid(targetUserId);
  const audience = normalizeUuid(options.audienceUserId);
  if (!target || !audience) {
    throw new Error("Public handle mention target is invalid.");
  }

  const payload: PublicHandleMentionPayload = {
    v: PAYLOAD_VERSION,
    t: target,
  };
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(
    ALGORITHM,
    deriveKey(audience, options.secret),
    iv,
  );
  cipher.setAAD(deriveAdditionalAuthenticatedData(audience));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const token = [
    TOKEN_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");

  if (token.length > PUBLIC_HANDLE_MENTION_TOKEN_MAX_LENGTH) {
    throw new Error("Public handle mention target is invalid.");
  }

  return token;
}

/**
 * Returns only the stable server-side target id. Every malformed, tampered,
 * wrong-audience, or wrong-secret token has the same null result.
 */
export function unsealPublicHandleMentionTarget(
  token: string | null | undefined,
  options: PublicHandleMentionTokenOptions,
): string | null {
  try {
    const audience = normalizeUuid(options.audienceUserId);
    if (
      !audience ||
      typeof token !== "string" ||
      token.length === 0 ||
      token.length > PUBLIC_HANDLE_MENTION_TOKEN_MAX_LENGTH
    ) {
      return null;
    }

    const segments = token.split(".");
    if (
      segments.length !== 4 ||
      segments[0] !== TOKEN_VERSION ||
      segments.slice(1).some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))
    ) {
      return null;
    }

    const iv = Buffer.from(segments[1]!, "base64url");
    const ciphertext = Buffer.from(segments[2]!, "base64url");
    const tag = Buffer.from(segments[3]!, "base64url");
    if (
      iv.length !== IV_LENGTH_BYTES ||
      ciphertext.length === 0 ||
      ciphertext.length > MAX_CIPHERTEXT_LENGTH_BYTES ||
      tag.length !== AUTH_TAG_LENGTH_BYTES ||
      !hasCanonicalBase64UrlEncoding(segments[1]!, iv) ||
      !hasCanonicalBase64UrlEncoding(segments[2]!, ciphertext) ||
      !hasCanonicalBase64UrlEncoding(segments[3]!, tag)
    ) {
      return null;
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      deriveKey(audience, options.secret),
      iv,
    );
    decipher.setAAD(deriveAdditionalAuthenticatedData(audience));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(
      plaintext,
    ) as Partial<PublicHandleMentionPayload>;
    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      Object.keys(payload).sort().join(",") !== "t,v" ||
      payload.v !== PAYLOAD_VERSION
    ) {
      return null;
    }

    return normalizeUuid(payload.t);
  } catch {
    return null;
  }
}

function deriveKey(audienceUserId: string, secret?: string) {
  const resolvedSecret = secret ?? resolveBetterAuthSecret();
  if (typeof resolvedSecret !== "string" || resolvedSecret.length < 32) {
    throw new Error("Public handle mention target is invalid.");
  }

  return createHmac("sha256", resolvedSecret)
    .update(CONTEXT, "utf8")
    .update("\0audience\0", "utf8")
    .update(audienceUserId, "utf8")
    .digest();
}

function deriveAdditionalAuthenticatedData(audienceUserId: string) {
  return Buffer.from(`${CONTEXT}\0${audienceUserId}`, "utf8");
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function hasCanonicalBase64UrlEncoding(segment: string, decoded: Buffer) {
  return decoded.toString("base64url") === segment;
}
