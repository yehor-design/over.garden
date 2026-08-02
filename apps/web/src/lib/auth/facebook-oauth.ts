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
  if (isFacebookLoginExplicitlyDisabled(env)) return null;
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
      configured &&
      !isFacebookLoginExplicitlyDisabled(env) &&
      (!isFacebookProductionRuntime(env) || publicLaunchReady),
    localRedirectUri: FACEBOOK_OAUTH_LOCAL_REDIRECT_URI,
    productionRedirectUri: FACEBOOK_OAUTH_PRODUCTION_REDIRECT_URI,
  };
}

function isFacebookProductionRuntime(env: EnvLike): boolean {
  // Fail closed whenever an explicitly configured canonical public origin is
  // serving, not only when Vercel's automatic runtime markers are present.
  // Some Vercel server functions do not expose every automatic marker at
  // runtime, while the canonical public origin remains a stable production
  // boundary. Local development keeps its explicit provider-testing path.
  return (
    isVercelProductionRuntime(env) ||
    env.NODE_ENV === "production" ||
    isCanonicalPublicOriginConfigured(env)
  );
}

function isFacebookLoginPublicReady(env: EnvLike): boolean {
  const value = env[FACEBOOK_LOGIN_PUBLIC_READY_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function isFacebookLoginExplicitlyDisabled(env: EnvLike): boolean {
  const value = env[FACEBOOK_LOGIN_PUBLIC_READY_ENV]?.trim();
  return Boolean(value) && !isFacebookLoginPublicReady(env);
}

function isCanonicalPublicOriginConfigured(env: EnvLike): boolean {
  return [env.BETTER_AUTH_URL, env.PUBLIC_SITE_URL, env.NEXT_PUBLIC_SITE_URL].some(
    (value) => {
      if (!value?.trim()) return false;

      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          (url.hostname === "over.garden" || url.hostname === "www.over.garden")
        );
      } catch {
        return false;
      }
    },
  );
}
