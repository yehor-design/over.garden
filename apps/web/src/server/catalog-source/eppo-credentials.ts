import "server-only";

import { createHash } from "node:crypto";

export const EPPO_DATA_PORTAL_API_KEY_ENV = "EPPO_DATA_PORTAL_API_KEY";
export const EPPO_LEGACY_CREDENTIAL_ENV_NAMES = [
  "EPPO_API_KEY",
  "EPPO_DATA_SERVICES_TOKEN",
] as const;

export type EppoCredentialErrorCode =
  | "missing_credential"
  | "invalid_credential"
  | "legacy_alias_configured";

export class EppoCredentialError extends Error {
  constructor(readonly code: EppoCredentialErrorCode) {
    super(`EPPO credential policy failed: ${code}`);
    this.name = "EppoCredentialError";
  }
}

type EppoCredentialEnvironment = Record<string, string | undefined>;

/**
 * EPPO does not publish a stable key-shape contract. Admit only one opaque,
 * single-line value and reject values that look like a shell option, an env
 * assignment, or an account-password paste. Never normalize a key: changing
 * whitespace changes provider credentials.
 */
export function assertValidEppoCredential(value: string | undefined): string {
  if (
    !value ||
    value.trim() !== value ||
    value.length > 512 ||
    /[\r\n\u0000]/u.test(value) ||
    /^(?:--?(?:key|token|password)|(?:password|passphrase)\s*[:=]|EPPO_[A-Z0-9_]+\s*=)/iu.test(
      value,
    )
  ) {
    throw new EppoCredentialError(
      value ? "invalid_credential" : "missing_credential",
    );
  }

  return value;
}

/**
 * The one runtime loader for EPPO credentials. Downstream source work must
 * import this owner instead of reading process.env directly.
 */
export function resolveEppoCredential(
  env: EppoCredentialEnvironment = process.env,
): string {
  if (EPPO_LEGACY_CREDENTIAL_ENV_NAMES.some((name) => Boolean(env[name]))) {
    throw new EppoCredentialError("legacy_alias_configured");
  }

  return assertValidEppoCredential(env[EPPO_DATA_PORTAL_API_KEY_ENV]);
}

/**
 * A short SHA-256 prefix is receipt-safe correlation material. It is never a
 * credential validator and must not be used to compare user-provided values.
 */
export function eppoCredentialFingerprintPrefix(
  credential: string,
  prefixLength = 12,
): string {
  assertValidEppoCredential(credential);
  if (
    !Number.isSafeInteger(prefixLength) ||
    prefixLength < 8 ||
    prefixLength > 32
  ) {
    throw new EppoCredentialError("invalid_credential");
  }

  return createHash("sha256")
    .update(credential, "utf8")
    .digest("hex")
    .slice(0, prefixLength);
}

export function redactEppoCredentialForReceipt(credential: string): string {
  return `redacted:${eppoCredentialFingerprintPrefix(credential)}`;
}
