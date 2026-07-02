import { describe, expect, it } from "vitest";

import { socialAccountPolicy } from "./social-account-policy";

describe("social account policy", () => {
  it("requires explicit same-account linking instead of implicit email takeover", () => {
    const policy = socialAccountPolicy();

    expect(policy.encryptOAuthTokens).toBe(true);
    expect(policy.accountLinking).toMatchObject({
      enabled: true,
      disableImplicitLinking: true,
      trustedProviders: ["google", "facebook"],
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
      updateUserInfoOnLink: false,
    });
  });
});
