import { randomBytes } from "node:crypto";

type EnvLike = Record<string, string | undefined>;
type GlobalWithLocalAuthSecret = typeof globalThis & {
  overGardenLocalBetterAuthSecret?: string;
};

export const BETTER_AUTH_SECRETS_ENV = "BETTER_AUTH_SECRETS";
export const BETTER_AUTH_CURRENT_SECRET_VERSION_ENV =
  "BETTER_AUTH_CURRENT_SECRET_VERSION";

const missingAuthSecretMessage =
  "Invalid Better Auth secret policy: a versioned current secret is required.";
const localDevelopmentSecretPrefix =
  "local-development-only-overgarden-better-auth-secret-";
const LOCAL_FALLBACK_VERSION = 0;
const VERSION_PATTERN = /^(0|[1-9]\d*)$/;
const STRONG_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type AuthSecretHealthClass =
  | "versioned_current"
  | "legacy_transition"
  | "local_fallback"
  | "closed";

export interface VersionedAuthSecret {
  version: number;
  value: string;
}

export interface AuthSecretHealth {
  class: AuthSecretHealthClass;
  activeVersion?: number;
}

export interface AuthSecretConfiguration {
  health: AuthSecretHealth;
  active: VersionedAuthSecret;
  /**
   * This ordered set is passed directly to Better Auth. Its first entry is
   * always the declared active version; readers select other entries by the
   * version label, never by trial decryption.
   */
  versionedSecrets: VersionedAuthSecret[];
  /** Bare Better Auth fallback for pre-versioned encrypted state only. */
  legacySecret?: string;
}

interface ClosedAuthSecretConfiguration {
  health: AuthSecretHealth;
}

type EvaluatedAuthSecretConfiguration =
  | AuthSecretConfiguration
  | ClosedAuthSecretConfiguration;

/**
 * Resolves the one canonical server-side secret policy. In a serving
 * Production or Preview runtime, only a declared, strong versioned current
 * key is admissible. Builds and local development retain an isolated fallback
 * so static generation and test runners do not manufacture deployable state.
 */
export function resolveAuthSecretConfiguration(
  env: EnvLike = readRuntimeAuthEnv(),
): AuthSecretConfiguration {
  const evaluated = evaluateAuthSecretConfiguration(env);
  if (!("active" in evaluated)) {
    throw new Error(missingAuthSecretMessage);
  }
  return evaluated;
}

/**
 * Health is deliberately class-only. It is safe for the existing noindex
 * diagnostics page and never exposes material, a digest, or an encoded size.
 */
export function getAuthSecretHealth(
  env: EnvLike = readRuntimeAuthEnv(),
): AuthSecretHealth {
  return evaluateAuthSecretConfiguration(env).health;
}

/** Legacy compatibility alias for active, server-only consumers. */
export function resolveBetterAuthSecret(
  env: EnvLike = readRuntimeAuthEnv(),
): string {
  return resolveAuthSecretConfiguration(env).active.value;
}

export function hasUsableBetterAuthSecret(
  env: EnvLike = readRuntimeAuthEnv(),
): boolean {
  return getAuthSecretHealth(env).class !== "closed";
}

/**
 * Supplies Better Auth's native versioned envelope API and its singular
 * legacy fallback. The `secrets` order is policy-validated before Better Auth
 * sees it, so its first entry is always the explicit active version.
 */
export function resolveBetterAuthSecretOptions(
  env: EnvLike = readRuntimeAuthEnv(),
): {
  secret?: string;
  secrets?: VersionedAuthSecret[];
} {
  const configuration = resolveAuthSecretConfiguration(env);
  if (configuration.health.class === "versioned_current") {
    return {
      secret: configuration.legacySecret,
      secrets: configuration.versionedSecrets,
    };
  }

  return { secret: configuration.active.value };
}

/** Returns one exact current or versioned key; it never searches key material. */
export function selectVersionedAuthSecret(
  version: number,
  configuration: AuthSecretConfiguration = resolveAuthSecretConfiguration(),
): VersionedAuthSecret | null {
  if (!Number.isSafeInteger(version) || version < 0) return null;

  if (configuration.health.class !== "versioned_current") {
    return configuration.active.version === version
      ? configuration.active
      : null;
  }

  return (
    configuration.versionedSecrets.find((entry) => entry.version === version) ??
    null
  );
}

/** Returns the one bare legacy key, if it remains in the bounded grace set. */
export function selectLegacyAuthSecret(
  configuration: AuthSecretConfiguration = resolveAuthSecretConfiguration(),
): string | null {
  return (
    configuration.legacySecret ??
    (configuration.health.class === "legacy_transition"
      ? configuration.active.value
      : null)
  );
}

export function isProductionLikeRuntime(env: EnvLike = process.env): boolean {
  return (
    env.NODE_ENV === "production" ||
    env.VERCEL === "1" ||
    env.VERCEL_ENV === "production" ||
    env.VERCEL_ENV === "preview"
  );
}

/** Only legacy material uses this permissive admission path during grace. */
export function isBlockedBetterAuthSecret(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (trimmed === '\"\"' || trimmed === "''") return true;

  const normalized = trimmed.toLowerCase();
  return (
    normalized.startsWith(localDevelopmentSecretPrefix) ||
    (normalized.includes("development") &&
      normalized.includes("better-auth-secret")) ||
    normalized.includes("change_me") ||
    normalized.includes("change-before-deploy") ||
    normalized.includes("...")
  );
}

function evaluateAuthSecretConfiguration(
  env: EnvLike,
): EvaluatedAuthSecretConfiguration {
  const legacySecret = configuredLegacyBetterAuthSecret(env.BETTER_AUTH_SECRET);
  const hasBlockedLegacySecret = Boolean(
    configuredRawValue(env.BETTER_AUTH_SECRET) && !legacySecret,
  );
  const versionedSecrets = parseVersionedAuthSecrets(
    env[BETTER_AUTH_SECRETS_ENV],
  );
  const activeVersion = parseCurrentVersion(
    env[BETTER_AUTH_CURRENT_SECRET_VERSION_ENV],
  );

  if (
    !hasBlockedLegacySecret &&
    versionedSecrets &&
    activeVersion !== null &&
    versionedSecrets[0]?.version === activeVersion
  ) {
    return {
      health: { class: "versioned_current", activeVersion },
      active: versionedSecrets[0],
      versionedSecrets,
      legacySecret,
    };
  }

  if (isProductionLikeRuntime(env) && !isBuildRuntime(env)) {
    return { health: { class: "closed" } };
  }

  if (legacySecret) {
    return {
      health: { class: "legacy_transition" },
      active: { version: LOCAL_FALLBACK_VERSION, value: legacySecret },
      versionedSecrets: [],
      legacySecret,
    };
  }

  return {
    health: { class: "local_fallback", activeVersion: LOCAL_FALLBACK_VERSION },
    active: {
      version: LOCAL_FALLBACK_VERSION,
      value: getLocalDevelopmentSecret(),
    },
    versionedSecrets: [],
  };
}

function parseVersionedAuthSecrets(
  value: string | undefined,
): VersionedAuthSecret[] | null {
  const configured = value;
  if (!configured) return [];

  // Secret material and version metadata are an exact provider contract. Do
  // not silently repair whitespace or quote-like values that could represent a
  // mistaken console paste; a serving deployment must fail closed instead.
  if (configured.trim() !== configured) return null;

  const seenVersions = new Set<number>();
  const parsed: VersionedAuthSecret[] = [];
  for (const entry of configured.split(",")) {
    const match = /^(0|[1-9]\d*):([A-Za-z0-9_-]+)$/.exec(entry);
    if (!match) return null;

    const version = Number(match[1]);
    const secret = match[2]!;
    if (
      !Number.isSafeInteger(version) ||
      version < 0 ||
      seenVersions.has(version) ||
      !isStrongEncodedSecret(secret)
    ) {
      return null;
    }

    seenVersions.add(version);
    parsed.push({ version, value: secret });
  }

  return parsed.length > 0 ? parsed : null;
}

function parseCurrentVersion(value: string | undefined): number | null {
  const configured = value;
  if (!configured || !VERSION_PATTERN.test(configured)) return null;

  const version = Number(configured);
  return Number.isSafeInteger(version) && version >= 0 ? version : null;
}

function isStrongEncodedSecret(value: string): boolean {
  if (!STRONG_SECRET_PATTERN.test(value)) return false;

  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === 32 && decoded.toString("base64url") === value;
  } catch {
    return false;
  }
}

function configuredLegacyBetterAuthSecret(value: string | undefined) {
  const trimmed = configuredRawValue(value);
  if (!trimmed) return undefined;
  if (isBlockedBetterAuthSecret(trimmed)) return undefined;

  return trimmed;
}

function configuredRawValue(value: string | undefined) {
  const trimmed = value?.trim();
  return !trimmed ? undefined : trimmed;
}

function isBuildRuntime(env: EnvLike = process.env): boolean {
  return (
    env.NEXT_PHASE === "phase-production-build" ||
    env.CI === "1" ||
    env.CI === "true"
  );
}

// Keep these accesses explicit so production bundlers retain each runtime key.
function readRuntimeAuthEnv(): EnvLike {
  return {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_SECRETS: process.env.BETTER_AUTH_SECRETS,
    BETTER_AUTH_CURRENT_SECRET_VERSION:
      process.env.BETTER_AUTH_CURRENT_SECRET_VERSION,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PHASE: process.env.NEXT_PHASE,
    CI: process.env.CI,
  };
}

function getLocalDevelopmentSecret() {
  const globalForAuth = globalThis as GlobalWithLocalAuthSecret;
  globalForAuth.overGardenLocalBetterAuthSecret ??= `${localDevelopmentSecretPrefix}${randomBytes(32).toString("base64url")}`;

  return globalForAuth.overGardenLocalBetterAuthSecret;
}
