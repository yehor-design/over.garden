import { describe, expect, it } from "vitest";

import {
  googleOAuthConfigurationState,
  isGoogleSignInEnabled,
  resolveGoogleSocialProviderConfig,
} from "./google-oauth";

describe("Google OAuth configuration", () => {
  it("enables Google only when both non-placeholder credentials are present", () => {
    expect(isGoogleSignInEnabled({})).toBe(false);
    expect(
      isGoogleSignInEnabled({
        GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
      }),
    ).toBe(false);
    expect(
      isGoogleSignInEnabled({
        GOOGLE_CLIENT_ID: "change_me",
        GOOGLE_CLIENT_SECRET: "secret",
      }),
    ).toBe(false);
    expect(
      isGoogleSignInEnabled({
        GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "secret",
      }),
    ).toBe(true);
  });

  it("keeps OAuth credentials out of safe configuration state", () => {
    const provider = resolveGoogleSocialProviderConfig({
      GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "google-secret-that-must-not-leak",
    });
    const state = googleOAuthConfigurationState({
      GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "google-secret-that-must-not-leak",
    });

    expect(provider).toMatchObject({
      clientId: "client-id.apps.googleusercontent.com",
      clientSecret: "google-secret-that-must-not-leak",
      disableIdTokenSignIn: true,
      accessType: "online",
    });
    expect(JSON.stringify(state)).not.toContain("client-id");
    expect(JSON.stringify(state)).not.toContain("google-secret");
    expect(state).toMatchObject({
      configured: true,
      clientIdConfigured: true,
      clientSecretConfigured: true,
      productionRedirectUri: "https://over.garden/api/auth/callback/google",
    });
  });
});
