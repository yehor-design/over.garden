import { randomUUID } from "node:crypto";

type EnvLike = Record<string, string | undefined>;
type GlobalWithLocalAuthSecret = typeof globalThis & {
  overGardenLocalBetterAuthSecret?: string;
};

const missingAuthSecretMessage =
  "Missing required environment variable: BETTER_AUTH_SECRET";

export function resolveBetterAuthSecret(env: EnvLike = process.env) {
  const configured = configuredAuthSecret(env.BETTER_AUTH_SECRET);
  if (configured) return configured;

  if (isProductionLikeRuntime(env)) {
    throw new Error(missingAuthSecretMessage);
  }

  return getLocalDevelopmentSecret();
}

export function hasUsableBetterAuthSecret(env: EnvLike = process.env) {
  return Boolean(configuredAuthSecret(env.BETTER_AUTH_SECRET));
}

export function isProductionLikeRuntime(env: EnvLike = process.env) {
  return (
    env.NODE_ENV === "production" ||
    env.VERCEL === "1" ||
    env.VERCEL_ENV === "production" ||
    env.VERCEL_ENV === "preview"
  );
}

export function isBlockedBetterAuthSecret(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return false;

  const normalized = trimmed.toLowerCase();
  return (
    normalized.includes("development") &&
    normalized.includes("better-auth-secret")
  );
}

function configuredAuthSecret(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return undefined;
  if (isBlockedBetterAuthSecret(trimmed)) return undefined;

  const normalized = trimmed.toLowerCase();
  if (normalized.includes("change_me") || normalized.includes("...")) {
    return undefined;
  }
  if (normalized.includes("change-before-deploy")) return undefined;

  return trimmed;
}

function getLocalDevelopmentSecret() {
  const globalForAuth = globalThis as GlobalWithLocalAuthSecret;
  globalForAuth.overGardenLocalBetterAuthSecret ??= `local-development-only-overgarden-better-auth-secret-${randomUUID()}`;

  return globalForAuth.overGardenLocalBetterAuthSecret;
}
