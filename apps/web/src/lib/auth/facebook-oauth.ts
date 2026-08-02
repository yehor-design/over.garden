import "server-only";

import { configuredEnvValue, type EnvLike } from "@/lib/auth/oauth-env";

export const FACEBOOK_CLIENT_ID_ENV = "FACEBOOK_CLIENT_ID";
export const FACEBOOK_CLIENT_SECRET_ENV = "FACEBOOK_CLIENT_SECRET";
export const FACEBOOK_LOGIN_PUBLIC_READY_ENV = "FACEBOOK_LOGIN_PUBLIC_READY";
// Facebook has no verified non-role production proof. Keep the provider
// unavailable in this release regardless of credentials or environment state.
// Re-enabling it requires a separately reviewed code change and browser proof.
export const FACEBOOK_LOGIN_HARD_DISABLED = true;
export const FACEBOOK_OAUTH_LOCAL_REDIRECT_URI =
  "http://localhost:3000/api/auth/callback/facebook";
export const FACEBOOK_OAUTH_PRODUCTION_REDIRECT_URI =
  "https://over.garden/api/auth/callback/facebook";

export function resolveFacebookSocialProviderConfig(
  env: EnvLike = process.env,
) {
  if (FACEBOOK_LOGIN_HARD_DISABLED) return null;

  const clientId = configuredEnvValue(env[FACEBOOK_CLIENT_ID_ENV]);
  const clientSecret = configuredEnvValue(env[FACEBOOK_CLIENT_SECRET_ENV]);

  if (!clientId || !clientSecret) return null;
  if (!isFacebookLoginPublicReady(env)) return null;

  return {
    clientId,
    clientSecret,
    disableIdTokenSignIn: true,
  };
}

export function isFacebookSignInEnabled(env: EnvLike = process.env) {
  return resolveFacebookSocialProviderConfig(env) !== null;
}

export function facebookOAuthConfigurationState(env: EnvLike = process.env) {
  const clientIdConfigured = Boolean(
    configuredEnvValue(env[FACEBOOK_CLIENT_ID_ENV]),
  );
  const clientSecretConfigured = Boolean(
    configuredEnvValue(env[FACEBOOK_CLIENT_SECRET_ENV]),
  );
  const publicLaunchReady = isFacebookLoginPublicReady(env);
  const configured = clientIdConfigured && clientSecretConfigured;

  return {
    configured,
    clientIdConfigured,
    clientSecretConfigured,
    publicLaunchReady,
    hardDisabled: FACEBOOK_LOGIN_HARD_DISABLED,
    providerEnabled:
      !FACEBOOK_LOGIN_HARD_DISABLED && configured && publicLaunchReady,
    localRedirectUri: FACEBOOK_OAUTH_LOCAL_REDIRECT_URI,
    productionRedirectUri: FACEBOOK_OAUTH_PRODUCTION_REDIRECT_URI,
  };
}

function isFacebookLoginPublicReady(env: EnvLike): boolean {
  // This is an explicit provider-enable switch in every runtime. Credentials
  // only prove configuration; they never make Facebook sign-in visible.
  const value = env[FACEBOOK_LOGIN_PUBLIC_READY_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
