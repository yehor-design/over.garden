import { randomUUID } from "node:crypto";

type EnvLike = Record<string, string | undefined>;
type GlobalWithLocalAuthSecret = typeof globalThis & {
  overGardenLocalBetterAuthSecret?: string;
};

const missingAuthSecretMessage =
  "Missing required environment variable: BETTER_AUTH_SECRET";
const localDevelopmentSecretPrefix =
  "local-development-only-overgarden-better-auth-secret-";

export function resolveBetterAuthSecret(env: EnvLike = process.env): string {
  const configured = configuredBetterAuthSecret(env.BETTER_AUTH_SECRET);
  if (configured) return configured;

  if (isProductionLikeRuntime(env)) {
    throw new Error(missingAuthSecretMessage);
  }

  return getLocalDevelopmentSecret();
}

export function hasUsableBetterAuthSecret(
  env: EnvLike = process.env,
): boolean {
  return Boolean(configuredBetterAuthSecret(env.BETTER_AUTH_SECRET));
}

export function isProductionLikeRuntime(env: EnvLike = process.env): boolean {
  return (
    env.NODE_ENV === "production" ||
    env.VERCEL === "1" ||
    env.VERCEL_ENV === "production" ||
    env.VERCEL_ENV === "preview"
  );
}

export function isBlockedBetterAuthSecret(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return false;

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

function configuredBetterAuthSecret(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return undefined;
  if (isBlockedBetterAuthSecret(trimmed)) return undefined;

  return trimmed;
}

function getLocalDevelopmentSecret() {
  const globalForAuth = globalThis as GlobalWithLocalAuthSecret;
  globalForAuth.overGardenLocalBetterAuthSecret ??=
    `${localDevelopmentSecretPrefix}${randomUUID()}`;

  return globalForAuth.overGardenLocalBetterAuthSecret;
}
