import { describe, expect, it } from "vitest";

import { socialAccountPolicy } from "./social-account-policy";

describe("social account policy", () => {
  it("allows different provider emails only through explicit current-session linking", () => {
    const policy = socialAccountPolicy();

    expect(policy.encryptOAuthTokens).toBe(true);
    expect(policy.accountLinking).toMatchObject({
      enabled: true,
      disableImplicitLinking: true,
      trustedProviders: ["google"],
      allowDifferentEmails: true,
      allowUnlinkingAll: false,
      updateUserInfoOnLink: false,
    });
  });
});
