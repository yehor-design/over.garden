import "server-only";

export function socialAccountPolicy(explicitGoogleLinkingEnabled = false) {
  return {
    updateAccountOnSignIn: true,
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: explicitGoogleLinkingEnabled,
      disableImplicitLinking: true,
      trustedProviders: [],
      requireLocalEmailVerified: true,
      // A different provider may carry a different verified email, but only an
      // already authenticated gardener can explicitly start that link flow.
      allowDifferentEmails: true,
      allowUnlinkingAll: false,
      updateUserInfoOnLink: false,
    },
  };
}
