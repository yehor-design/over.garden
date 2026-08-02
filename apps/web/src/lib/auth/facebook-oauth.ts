import "server-only";

import { configuredEnvValue, type EnvLike } from "@/lib/auth/oauth-env";
import { isVercelProductionRuntime } from "@/lib/runtime-url";

export const FACEBOOK_CLIENT_ID_ENV = "FACEBOOK_CLIENT_ID";
export const FACEBOOK_CLIENT_SECRET_ENV = "FACEBOOK_CLIENT_SECRET";
export const FACEBOOK_LOGIN_PUBLIC_READY_ENV = "FACEBOOK_LOGIN_PUBLIC_READY";
export const FACEBOOK_OAUTH_LOCAL_REDIRECT_URI =
  "http://localhost:3000/api/auth/callback/facebook";
export const FACEBOOK_OAUTH_PRODUCTION_REDIRECT_URI =
  "https://over.garden/api/auth/callback/facebook";

export function resolveFacebookSocialProviderConfig(
  env: EnvLike = process.env,
) {
  const clientId = configuredEnvValue(env[FACEBOOK_CLIENT_ID_ENV]);
  const clientSecret = configuredEnvValue(env[FACEBOOK_CLIENT_SECRET_ENV]);

  if (!clientId || !clientSecret) return null;
  if (isFacebookProductionRuntime(env) && !isFacebookLoginPublicReady(env)) {
    return null;
  }

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
    providerEnabled:
      configured && (!isFacebookProductionRuntime(env) || publicLaunchReady),
    localRedirectUri: FACEBOOK_OAUTH_LOCAL_REDIRECT_URI,
    productionRedirectUri: FACEBOOK_OAUTH_PRODUCTION_REDIRECT_URI,
  };
}

function isFacebookProductionRuntime(env: EnvLike): boolean {
  // Vercel's serving environment must never expose Facebook just because one
  // of its runtime markers is unavailable to a server function. `NODE_ENV` is
  // the fail-closed fallback for a production Next server; development still
  // permits explicitly configured provider testing.
  return isVercelProductionRuntime(env) || env.NODE_ENV === "production";
}

function isFacebookLoginPublicReady(env: EnvLike): boolean {
  const value = env[FACEBOOK_LOGIN_PUBLIC_READY_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
