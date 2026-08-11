import { describe, expect, it } from "vitest";

import { socialAccountPolicy } from "./social-account-policy";

describe("social account policy", () => {
  it("fails explicit linking closed by default without weakening implicit-link or identity policy", () => {
    const policy = socialAccountPolicy();

    expect(policy.encryptOAuthTokens).toBe(true);
    expect(policy.accountLinking).toMatchObject({
      enabled: false,
      disableImplicitLinking: true,
      trustedProviders: [],
      requireLocalEmailVerified: true,
      allowDifferentEmails: true,
      allowUnlinkingAll: false,
      updateUserInfoOnLink: false,
    });
  });

  it("enables only the native explicit branch selected by the server gate", () => {
    expect(socialAccountPolicy(true).accountLinking).toMatchObject({
      enabled: true,
      disableImplicitLinking: true,
      trustedProviders: [],
      requireLocalEmailVerified: true,
      allowDifferentEmails: true,
      allowUnlinkingAll: false,
      updateUserInfoOnLink: false,
    });
  });
});
