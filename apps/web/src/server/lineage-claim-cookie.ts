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

const LEGACY_VERSION = "v1";
const CURRENT_VERSION = "v2";
const ALGORITHM = "aes-256-gcm";
const CONTEXT = "overgarden.lineage-claim-cookie.v1";
const MAX_TOKEN_LENGTH = 4096;
const VERSION_PATTERN = /^(0|[1-9]\d*)$/;

interface LineageClaimTokenOptions {
  /** Test-only legacy fixture compatibility. */
  secret?: string;
  authSecrets?: AuthSecretConfiguration;
}

export function sealLineageClaimToken(
  token: string,
  options: LineageClaimTokenOptions = {},
) {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    throw new Error("Lineage claim token is invalid.");
  }

  const writer = resolveWriter(options);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(writer.secret), iv);
  cipher.setAAD(Buffer.from(CONTEXT, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    writer.version === null ? LEGACY_VERSION : CURRENT_VERSION,
    ...(writer.version === null ? [] : [String(writer.version)]),
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function unsealLineageClaimToken(
  sealed: string | null | undefined,
  options: LineageClaimTokenOptions = {},
) {
  if (!sealed || sealed.length > 6144) return null;

  try {
    const parts = sealed.split(".");
    const isLegacy = parts.length === 4 && parts[0] === LEGACY_VERSION;
    const isCurrent = parts.length === 5 && parts[0] === CURRENT_VERSION;
    if (!isLegacy && !isCurrent) return null;

    const keyVersion = isCurrent ? parseVersion(parts[1]!) : null;
    if (isCurrent && keyVersion === null) return null;
    const offset = isCurrent ? 2 : 1;
    if (parts.slice(offset).some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
      return null;
    }

    const iv = Buffer.from(parts[offset]!, "base64url");
    const encrypted = Buffer.from(parts[offset + 1]!, "base64url");
    const tag = Buffer.from(parts[offset + 2]!, "base64url");
    if (
      iv.length !== 12 ||
      tag.length !== 16 ||
      !hasCanonicalBase64UrlEncoding(parts[offset]!, iv) ||
      !hasCanonicalBase64UrlEncoding(parts[offset + 1]!, encrypted) ||
      !hasCanonicalBase64UrlEncoding(parts[offset + 2]!, tag)
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

    const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), iv);
    decipher.setAAD(Buffer.from(CONTEXT, "utf8"));
    decipher.setAuthTag(tag);
    const token = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");

    return token.length > 0 && token.length <= MAX_TOKEN_LENGTH ? token : null;
  } catch {
    return null;
  }
}

function resolveWriter(options: LineageClaimTokenOptions) {
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

function deriveKey(secret: string) {
  return createHash("sha256")
    .update(CONTEXT, "utf8")
    .update("\0", "utf8")
    .update(secret, "utf8")
    .digest();
}

function hasCanonicalBase64UrlEncoding(segment: string, decoded: Buffer) {
  return decoded.toString("base64url") === segment;
}
