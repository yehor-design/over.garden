import "server-only";

import { headers } from "next/headers";

import { GOOGLE_PROVIDER_ID } from "@/lib/auth/social-oauth";
import { isExplicitGoogleLinkingEnabledForUser } from "@/lib/auth/explicit-google-linking";
import { auth } from "@/lib/auth";
import { getCurrentSession } from "@/server/auth-session";

export const ACCOUNT_METHOD_READBACK_DEADLINE_MS = 3_000;

export interface AccountMethodProjection {
  readbackState: "ready" | "retry";
  hasCredential: boolean;
  hasGoogle: boolean;
  canSetPassword: boolean;
  canLinkGoogle: boolean;
}

export async function getCurrentAccountMethodProjection(): Promise<AccountMethodProjection> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Authentication is required to read account methods.");
  }

  const accountReadback = await readAccountsWithinDeadline(await headers());
  if (accountReadback.status === "retry") return retryProjection();

  const accounts = accountReadback.accounts;
  const providerIds = new Set(accounts.map((account) => account.providerId));
  const hasCredential = providerIds.has("credential");
  const hasGoogle = providerIds.has(GOOGLE_PROVIDER_ID);
  const emailVerified = session.user.emailVerified === true;

  return {
    readbackState: "ready",
    hasCredential,
    hasGoogle,
    canSetPassword: !hasCredential && emailVerified,
    canLinkGoogle:
      !hasGoogle &&
      emailVerified &&
      isExplicitGoogleLinkingEnabledForUser(session.user.id),
  };
}

type AccountReadback =
  | {
      status: "ready";
      accounts: Awaited<ReturnType<typeof auth.api.listUserAccounts>>;
    }
  | { status: "retry" };

async function readAccountsWithinDeadline(
  requestHeaders: Headers,
): Promise<AccountReadback> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const accountRead: Promise<AccountReadback> = auth.api
    .listUserAccounts({ headers: requestHeaders })
    .then(
      (accounts): AccountReadback => ({ status: "ready", accounts }),
      (): AccountReadback => ({ status: "retry" }),
    );
  const timedOut = new Promise<AccountReadback>((resolve) => {
    deadline = setTimeout(
      () => resolve({ status: "retry" }),
      ACCOUNT_METHOD_READBACK_DEADLINE_MS,
    );
  });

  const result = await Promise.race([accountRead, timedOut]);
  if (deadline !== undefined) clearTimeout(deadline);
  return result;
}

function retryProjection(): AccountMethodProjection {
  return {
    readbackState: "retry",
    hasCredential: false,
    hasGoogle: false,
    canSetPassword: false,
    canLinkGoogle: false,
  };
}
