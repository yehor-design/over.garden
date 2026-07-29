import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import {
  type AuthSecretConfiguration,
  resolveAuthSecretConfiguration,
  selectLegacyAuthSecret,
  selectVersionedAuthSecret,
} from "@/lib/auth-secret";
import {
  type AuthIntentDraft,
  type AuthIntentPayload,
  normalizeAuthIntentDraft,
} from "@/lib/auth/auth-intent-contract";

const LEGACY_TOKEN_VERSION = "v1";
const CURRENT_TOKEN_VERSION = "v2";
const PAYLOAD_VERSION = 1;
const TOKEN_LIFETIME_MS = 15 * 60_000;
const TOKEN_AAD = Buffer.from("overgarden.auth-intent.v1", "utf8");
const TOKEN_MAX_LENGTH = 2048;
const VERSION_PATTERN = /^(0|[1-9]\d*)$/;

export type AuthIntentTokenErrorCode = "invalid" | "expired";

export class AuthIntentTokenError extends Error {
  readonly code: AuthIntentTokenErrorCode;
  readonly intent: AuthIntentDraft | null;

  constructor(
    code: AuthIntentTokenErrorCode,
    intent: AuthIntentDraft | null = null,
  ) {
    super(
      code === "expired"
        ? "Authentication intent expired."
        : "Authentication intent is invalid.",
    );
    this.name = "AuthIntentTokenError";
    this.code = code;
    this.intent = intent;
  }
}

interface AuthIntentTokenOptions {
  /** Test-only legacy fixture compatibility. Production callers use keyset. */
  secret?: string;
  authSecrets?: AuthSecretConfiguration;
  now?: number;
}

export function createAuthIntentToken(
  input: unknown,
  options: AuthIntentTokenOptions = {},
): string {
  const now = normalizeNow(options.now);
  const intent = normalizeAuthIntentDraft(input);
  const payload: AuthIntentPayload = {
    version: PAYLOAD_VERSION,
    ...intent,
    issuedAt: now,
    expiresAt: now + TOKEN_LIFETIME_MS,
  };
  const writer = resolveWriter(options);
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveTokenKey(writer.secret),
    iv,
  );
  cipher.setAAD(TOKEN_AAD);
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

  if (token.length > TOKEN_MAX_LENGTH)
    throw new AuthIntentTokenError("invalid");
  return token;
}

export function verifyAuthIntentToken(
  token: string,
  options: AuthIntentTokenOptions = {},
): AuthIntentPayload {
  const now = normalizeNow(options.now);

  try {
    if (
      typeof token !== "string" ||
      token.length === 0 ||
      token.length > TOKEN_MAX_LENGTH
    ) {
      throw new AuthIntentTokenError("invalid");
    }

    const decoded = decodeToken(token, options);
    const raw = JSON.parse(decoded) as Record<string, unknown>;
    const issuedAt = normalizeTimestamp(raw.issuedAt);
    const expiresAt = normalizeTimestamp(raw.expiresAt);

    if (
      raw.version !== PAYLOAD_VERSION ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt !== TOKEN_LIFETIME_MS ||
      issuedAt > now + 60_000
    ) {
      throw new AuthIntentTokenError("invalid");
    }
    const intent = normalizeAuthIntentDraft(raw);
    if (now > expiresAt) throw new AuthIntentTokenError("expired", intent);

    return {
      version: PAYLOAD_VERSION,
      ...intent,
      issuedAt,
      expiresAt,
    };
  } catch (error) {
    if (error instanceof AuthIntentTokenError) throw error;
    throw new AuthIntentTokenError("invalid");
  }
}

function decodeToken(token: string, options: AuthIntentTokenOptions) {
  const segments = token.split(".");
  const isLegacy =
    segments.length === 4 && segments[0] === LEGACY_TOKEN_VERSION;
  const isCurrent =
    segments.length === 5 && segments[0] === CURRENT_TOKEN_VERSION;
  if (!isLegacy && !isCurrent) throw new AuthIntentTokenError("invalid");

  const keyVersion = isCurrent ? parseVersion(segments[1]!) : null;
  if (isCurrent && keyVersion === null)
    throw new AuthIntentTokenError("invalid");
  const offset = isCurrent ? 2 : 1;
  const encodedParts = segments.slice(offset);
  if (encodedParts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    throw new AuthIntentTokenError("invalid");
  }

  const iv = Buffer.from(segments[offset]!, "base64url");
  const ciphertext = Buffer.from(segments[offset + 1]!, "base64url");
  const tag = Buffer.from(segments[offset + 2]!, "base64url");
  if (
    iv.length !== 12 ||
    tag.length !== 16 ||
    ciphertext.length > 1536 ||
    !hasCanonicalBase64UrlEncoding(segments[offset]!, iv) ||
    !hasCanonicalBase64UrlEncoding(segments[offset + 1]!, ciphertext) ||
    !hasCanonicalBase64UrlEncoding(segments[offset + 2]!, tag)
  ) {
    throw new AuthIntentTokenError("invalid");
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
  if (!secret) throw new AuthIntentTokenError("invalid");

  const decipher = createDecipheriv("aes-256-gcm", deriveTokenKey(secret), iv);
  decipher.setAAD(TOKEN_AAD);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

function resolveWriter(options: AuthIntentTokenOptions) {
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

function deriveTokenKey(secret: string) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new AuthIntentTokenError("invalid");
  }

  return createHash("sha256")
    .update("overgarden.auth-intent.v1\0", "utf8")
    .update(secret, "utf8")
    .digest();
}

function normalizeNow(value: number | undefined) {
  const now = value ?? Date.now();
  if (!Number.isFinite(now) || now < 0) {
    throw new AuthIntentTokenError("invalid");
  }
  return Math.trunc(now);
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AuthIntentTokenError("invalid");
  }
  return value;
}

function hasCanonicalBase64UrlEncoding(segment: string, decoded: Buffer) {
  return decoded.toString("base64url") === segment;
}
