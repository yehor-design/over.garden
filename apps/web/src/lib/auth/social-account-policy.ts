import "server-only";

import {
  FACEBOOK_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
} from "@/lib/auth/social-oauth";

export function socialAccountPolicy() {
  return {
    updateAccountOnSignIn: true,
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      trustedProviders: [GOOGLE_PROVIDER_ID, FACEBOOK_PROVIDER_ID],
      // A different provider may carry a different verified email, but only an
      // already authenticated gardener can explicitly start that link flow.
      allowDifferentEmails: true,
      allowUnlinkingAll: false,
      updateUserInfoOnLink: false,
    },
  };
}
