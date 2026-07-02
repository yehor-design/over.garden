import "server-only";

import { configuredEnvValue, type EnvLike } from "@/lib/auth/oauth-env";

export const FACEBOOK_CLIENT_ID_ENV = "FACEBOOK_CLIENT_ID";
export const FACEBOOK_CLIENT_SECRET_ENV = "FACEBOOK_CLIENT_SECRET";
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

  return {
    configured: clientIdConfigured && clientSecretConfigured,
    clientIdConfigured,
    clientSecretConfigured,
    localRedirectUri: FACEBOOK_OAUTH_LOCAL_REDIRECT_URI,
    productionRedirectUri: FACEBOOK_OAUTH_PRODUCTION_REDIRECT_URI,
  };
}
