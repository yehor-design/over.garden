import { describe, expect, it } from "vitest";

import {
  facebookOAuthConfigurationState,
  isFacebookSignInEnabled,
  resolveFacebookSocialProviderConfig,
} from "./facebook-oauth";

describe("Facebook OAuth configuration", () => {
  it("enables Facebook only when both non-placeholder credentials are present", () => {
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
      productionRedirectUri: "https://over.garden/api/auth/callback/facebook",
    });
  });
});
