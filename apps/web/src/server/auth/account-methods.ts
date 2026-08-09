import "server-only";

import { headers } from "next/headers";

import { GOOGLE_PROVIDER_ID } from "@/lib/auth/social-oauth";
import { auth } from "@/lib/auth";
import { getCurrentSession } from "@/server/auth-session";

export interface AccountMethodProjection {
  hasCredential: boolean;
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
    hasGoogle: providerIds.has(GOOGLE_PROVIDER_ID),
    canSetPassword: !hasCredential && session.user.emailVerified === true,
  };
}
