import "server-only";

import { GOOGLE_PROVIDER_ID } from "@/lib/auth/social-oauth";

export const GOOGLE_CLIENT_ID_ENV = "GOOGLE_CLIENT_ID";
export const GOOGLE_CLIENT_SECRET_ENV = "GOOGLE_CLIENT_SECRET";
export const GOOGLE_OAUTH_LOCAL_REDIRECT_URI =
  "http://localhost:3000/api/auth/callback/google";
export const GOOGLE_OAUTH_PRODUCTION_REDIRECT_URI =
  "https://over.garden/api/auth/callback/google";

type EnvLike = Record<string, string | undefined>;

export function resolveGoogleSocialProviderConfig(
  env: EnvLike = process.env,
) {
  const clientId = configuredEnvValue(env[GOOGLE_CLIENT_ID_ENV]);
  const clientSecret = configuredEnvValue(env[GOOGLE_CLIENT_SECRET_ENV]);

  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    accessType: "online" as const,
    disableIdTokenSignIn: true,
  };
}

export function isGoogleSignInEnabled(env: EnvLike = process.env) {
  return resolveGoogleSocialProviderConfig(env) !== null;
}

export function googleAccountPolicy() {
  return {
    updateAccountOnSignIn: true,
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      trustedProviders: [GOOGLE_PROVIDER_ID],
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
      updateUserInfoOnLink: false,
    },
  };
}

export function googleOAuthConfigurationState(env: EnvLike = process.env) {
  const clientIdConfigured = Boolean(
    configuredEnvValue(env[GOOGLE_CLIENT_ID_ENV]),
  );
  const clientSecretConfigured = Boolean(
    configuredEnvValue(env[GOOGLE_CLIENT_SECRET_ENV]),
  );

  return {
    configured: clientIdConfigured && clientSecretConfigured,
    clientIdConfigured,
    clientSecretConfigured,
    localRedirectUri: GOOGLE_OAUTH_LOCAL_REDIRECT_URI,
    productionRedirectUri: GOOGLE_OAUTH_PRODUCTION_REDIRECT_URI,
  };
}

function configuredEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return null;
  const normalized = trimmed.toLowerCase();
  if (normalized.includes("change_me") || normalized.includes("...")) {
    return null;
  }

  return trimmed;
}
