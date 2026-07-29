import "server-only";

import { headers } from "next/headers";

import {
  FACEBOOK_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
} from "@/lib/auth/social-oauth";
import { auth } from "@/lib/auth";
import { getCurrentSession } from "@/server/auth-session";

export interface AccountMethodProjection {
  hasCredential: boolean;
  hasFacebook: boolean;
  hasGoogle: boolean;
  canSetPassword: boolean;
}

export async function getCurrentAccountMethodProjection(): Promise<AccountMethodProjection> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Authentication is required to read account methods.");
  }

  const accounts = await auth.api.listUserAccounts({
    headers: await headers(),
  });
  const providerIds = new Set(accounts.map((account) => account.providerId));
  const hasCredential = providerIds.has("credential");

  return {
    hasCredential,
    hasFacebook: providerIds.has(FACEBOOK_PROVIDER_ID),
    hasGoogle: providerIds.has(GOOGLE_PROVIDER_ID),
    canSetPassword: !hasCredential && session.user.emailVerified === true,
  };
}
