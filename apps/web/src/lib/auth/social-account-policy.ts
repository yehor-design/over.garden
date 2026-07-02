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
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
      updateUserInfoOnLink: false,
    },
  };
}
