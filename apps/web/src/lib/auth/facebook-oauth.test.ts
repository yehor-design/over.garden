import { describe, expect, it } from "vitest";

import {
  facebookOAuthConfigurationState,
  isFacebookSignInEnabled,
  resolveFacebookSocialProviderConfig,
} from "./facebook-oauth";

describe("Facebook OAuth configuration", () => {
  it("hard-disables Facebook in every runtime even with public-ready credentials", () => {
    expect(isFacebookSignInEnabled({})).toBe(false);
    expect(
      isFacebookSignInEnabled({
        FACEBOOK_CLIENT_ID: "facebook-app-id",
      }),
    ).toBe(false);
    expect(
      isFacebookSignInEnabled({
        FACEBOOK_CLIENT_ID: "change_me",
        FACEBOOK_CLIENT_SECRET: "secret",
      }),
    ).toBe(false);
    expect(
      isFacebookSignInEnabled({
        FACEBOOK_CLIENT_ID: "facebook-app-id",
        FACEBOOK_CLIENT_SECRET: "secret",
      }),
    ).toBe(false);
    expect(
      isFacebookSignInEnabled({
        FACEBOOK_CLIENT_ID: "facebook-app-id",
        FACEBOOK_CLIENT_SECRET: "secret",
        FACEBOOK_LOGIN_PUBLIC_READY: "true",
      }),
    ).toBe(false);
  });

  it("does not let production readiness override the hard disable", () => {
    const productionEnv = {
      FACEBOOK_CLIENT_ID: "facebook-app-id",
      FACEBOOK_CLIENT_SECRET: "secret",
      VERCEL: "1",
      VERCEL_ENV: "production",
    };

    expect(isFacebookSignInEnabled(productionEnv)).toBe(false);
    expect(resolveFacebookSocialProviderConfig(productionEnv)).toBeNull();
    expect(facebookOAuthConfigurationState(productionEnv)).toMatchObject({
      configured: true,
      publicLaunchReady: false,
      providerEnabled: false,
    });

    expect(
      isFacebookSignInEnabled({
        ...productionEnv,
        FACEBOOK_LOGIN_PUBLIC_READY: "true",
      }),
    ).toBe(false);
    expect(
      facebookOAuthConfigurationState({
        ...productionEnv,
        FACEBOOK_LOGIN_PUBLIC_READY: "1",
      }),
    ).toMatchObject({
      configured: true,
      publicLaunchReady: true,
      hardDisabled: true,
      providerEnabled: false,
    });
  });

  it("fails closed when production runtime markers are unavailable", () => {
    const productionEnv = {
      FACEBOOK_CLIENT_ID: "facebook-app-id",
      FACEBOOK_CLIENT_SECRET: "secret",
      NODE_ENV: "production",
    };

    expect(isFacebookSignInEnabled(productionEnv)).toBe(false);
    expect(resolveFacebookSocialProviderConfig(productionEnv)).toBeNull();
    expect(facebookOAuthConfigurationState(productionEnv)).toMatchObject({
      configured: true,
      publicLaunchReady: false,
      providerEnabled: false,
    });
  });

  it("fails closed for a configured canonical public origin", () => {
    const productionEnv = {
      FACEBOOK_CLIENT_ID: "facebook-app-id",
      FACEBOOK_CLIENT_SECRET: "secret",
      PUBLIC_SITE_URL: "https://over.garden",
    };

    expect(isFacebookSignInEnabled(productionEnv)).toBe(false);
    expect(resolveFacebookSocialProviderConfig(productionEnv)).toBeNull();
    expect(facebookOAuthConfigurationState(productionEnv)).toMatchObject({
      configured: true,
      publicLaunchReady: false,
      providerEnabled: false,
    });
  });

  it("remains hard-disabled when the readiness value is false", () => {
    const disabledEnv = {
      FACEBOOK_CLIENT_ID: "facebook-app-id",
      FACEBOOK_CLIENT_SECRET: "secret",
      FACEBOOK_LOGIN_PUBLIC_READY: "false",
    };

    expect(isFacebookSignInEnabled(disabledEnv)).toBe(false);
    expect(resolveFacebookSocialProviderConfig(disabledEnv)).toBeNull();
    expect(facebookOAuthConfigurationState(disabledEnv)).toMatchObject({
      configured: true,
      publicLaunchReady: false,
      providerEnabled: false,
    });
  });

  it("keeps OAuth credentials out of safe configuration state", () => {
    const provider = resolveFacebookSocialProviderConfig({
      FACEBOOK_CLIENT_ID: "facebook-app-id",
      FACEBOOK_CLIENT_SECRET: "facebook-secret-that-must-not-leak",
      FACEBOOK_LOGIN_PUBLIC_READY: "true",
    });
    const state = facebookOAuthConfigurationState({
      FACEBOOK_CLIENT_ID: "facebook-app-id",
      FACEBOOK_CLIENT_SECRET: "facebook-secret-that-must-not-leak",
      FACEBOOK_LOGIN_PUBLIC_READY: "true",
    });

    expect(provider).toBeNull();
    expect(JSON.stringify(state)).not.toContain("facebook-app-id");
    expect(JSON.stringify(state)).not.toContain("facebook-secret");
    expect(state).toMatchObject({
      configured: true,
      clientIdConfigured: true,
      clientSecretConfigured: true,
      publicLaunchReady: true,
      hardDisabled: true,
      providerEnabled: false,
      productionRedirectUri: "https://over.garden/api/auth/callback/facebook",
    });
  });
});
