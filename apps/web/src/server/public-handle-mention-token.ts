import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

import {
  type AuthSecretConfiguration,
  resolveAuthSecretConfiguration,
  selectLegacyAuthSecret,
  selectVersionedAuthSecret,
} from "@/lib/auth-secret";

const LEGACY_TOKEN_VERSION = "v1";
const CURRENT_TOKEN_VERSION = "v2";
const PAYLOAD_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const CONTEXT = "overgarden.public-handle-mention-target.v1";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const MAX_CIPHERTEXT_LENGTH_BYTES = 64;
const VERSION_PATTERN = /^(0|[1-9]\d*)$/;

/**
 * Must remain within the browser-safe mention selection contract. The current
 * fixed payload produces a token below this bound even with a version label.
 */
export const PUBLIC_HANDLE_MENTION_TOKEN_MAX_LENGTH = 120;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PublicHandleMentionTokenOptions {
  audienceUserId: string;
  /** Test-only legacy fixture compatibility. */
  secret?: string;
  authSecrets?: AuthSecretConfiguration;
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
  const writer = resolveWriter(options);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(
    ALGORITHM,
    deriveKey(audience, writer.secret),
    iv,
  );
  cipher.setAAD(deriveAdditionalAuthenticatedData(audience));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const token = [
    writer.version === null ? LEGACY_TOKEN_VERSION : CURRENT_TOKEN_VERSION,
    ...(writer.version === null ? [] : [String(writer.version)]),
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
 * wrong-audience, unknown-version, or wrong-secret token has the same null
 * result. Versioned readers select the named key once and never scan keys.
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

    const decoded = decodeToken(token, audience, options);
    if (!decoded) return null;
    const payload = JSON.parse(decoded) as Partial<PublicHandleMentionPayload>;
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

function decodeToken(
  token: string,
  audience: string,
  options: PublicHandleMentionTokenOptions,
) {
  const segments = token.split(".");
  const isLegacy =
    segments.length === 4 && segments[0] === LEGACY_TOKEN_VERSION;
  const isCurrent =
    segments.length === 5 && segments[0] === CURRENT_TOKEN_VERSION;
  if (!isLegacy && !isCurrent) return null;

  const keyVersion = isCurrent ? parseVersion(segments[1]!) : null;
  if (isCurrent && keyVersion === null) return null;
  const offset = isCurrent ? 2 : 1;
  if (segments.slice(offset).some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return null;
  }

  const iv = Buffer.from(segments[offset]!, "base64url");
  const ciphertext = Buffer.from(segments[offset + 1]!, "base64url");
  const tag = Buffer.from(segments[offset + 2]!, "base64url");
  if (
    iv.length !== IV_LENGTH_BYTES ||
    ciphertext.length === 0 ||
    ciphertext.length > MAX_CIPHERTEXT_LENGTH_BYTES ||
    tag.length !== AUTH_TAG_LENGTH_BYTES ||
    !hasCanonicalBase64UrlEncoding(segments[offset]!, iv) ||
    !hasCanonicalBase64UrlEncoding(segments[offset + 1]!, ciphertext) ||
    !hasCanonicalBase64UrlEncoding(segments[offset + 2]!, tag)
  ) {
    return null;
  }

  const secret =
    keyVersion === null
      ? (options.secret ??
        selectLegacyAuthSecret(
          options.authSecrets ?? resolveAuthSecretConfiguration(),
        ))
      : selectVersionedAuthSecret(
          keyVersion,
          options.authSecrets ?? resolveAuthSecretConfiguration(),
        )?.value;
  if (!secret) return null;

  const decipher = createDecipheriv(ALGORITHM, deriveKey(audience, secret), iv);
  decipher.setAAD(deriveAdditionalAuthenticatedData(audience));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

function resolveWriter(options: PublicHandleMentionTokenOptions) {
  if (options.secret) return { version: null, secret: options.secret };
  const configuration = options.authSecrets ?? resolveAuthSecretConfiguration();
  if (configuration.health.class === "legacy_transition") {
    return { version: null, secret: configuration.active.value };
  }
  return {
    version: configuration.active.version,
    secret: configuration.active.value,
  };
}

function parseVersion(value: string): number | null {
  if (!VERSION_PATTERN.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) && version >= 0 ? version : null;
}

function deriveKey(audienceUserId: string, secret: string) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("Public handle mention target is invalid.");
  }

  return createHmac("sha256", secret)
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
