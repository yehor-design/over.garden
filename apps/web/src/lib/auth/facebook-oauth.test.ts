import { describe, expect, it } from "vitest";

import {
  facebookOAuthConfigurationState,
  isFacebookSignInEnabled,
  resolveFacebookSocialProviderConfig,
} from "./facebook-oauth";

describe("Facebook OAuth configuration", () => {
  it("enables Facebook outside production only when both non-placeholder credentials are present", () => {
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
    ).toBe(true);
  });

  it("hides Facebook Login in Vercel production until real non-role readiness is explicitly approved", () => {
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
    ).toBe(true);
    expect(
      facebookOAuthConfigurationState({
        ...productionEnv,
        FACEBOOK_LOGIN_PUBLIC_READY: "1",
      }),
    ).toMatchObject({
      configured: true,
      publicLaunchReady: true,
      providerEnabled: true,
    });
  });

  it("keeps OAuth credentials out of safe configuration state", () => {
    const provider = resolveFacebookSocialProviderConfig({
      FACEBOOK_CLIENT_ID: "facebook-app-id",
      FACEBOOK_CLIENT_SECRET: "facebook-secret-that-must-not-leak",
    });
    const state = facebookOAuthConfigurationState({
      FACEBOOK_CLIENT_ID: "facebook-app-id",
      FACEBOOK_CLIENT_SECRET: "facebook-secret-that-must-not-leak",
    });

    expect(provider).toMatchObject({
      clientId: "facebook-app-id",
      clientSecret: "facebook-secret-that-must-not-leak",
      disableIdTokenSignIn: true,
    });
    expect(JSON.stringify(state)).not.toContain("facebook-app-id");
    expect(JSON.stringify(state)).not.toContain("facebook-secret");
    expect(state).toMatchObject({
      configured: true,
      clientIdConfigured: true,
      clientSecretConfigured: true,
      publicLaunchReady: false,
      providerEnabled: true,
      productionRedirectUri: "https://over.garden/api/auth/callback/facebook",
    });
  });
});
