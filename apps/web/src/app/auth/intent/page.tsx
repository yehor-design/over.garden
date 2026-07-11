import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isFacebookSignInEnabled } from "@/lib/auth/facebook-oauth";
import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import { oauthErrorRecoveryMessage } from "@/lib/auth/social-oauth";
import type { AuthIntentDraft } from "@/lib/auth/auth-intent-contract";
import { getCurrentSession } from "@/server/auth-session";
import {
  AuthIntentTokenError,
  verifyAuthIntentToken,
} from "@/server/auth-intent-token";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { AuthIntentSurface } from "./auth-intent-surface";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Continue your action | OverGarden",
  robots: { index: false, follow: false },
};

type AuthIntentSearchParams = Record<string, string | string[] | undefined>;

export default async function AuthIntentPage({
  searchParams,
}: {
  searchParams?: Promise<AuthIntentSearchParams>;
}) {
  const [params, locale, session] = await Promise.all([
    searchParams ?? Promise.resolve<AuthIntentSearchParams>({}),
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const token = firstParam(params.intent);
  const requestedState = firstParam(params.state);
  let intent: AuthIntentDraft | null = null;
  let state: "ready" | "invalid" | "expired" = "invalid";

  if (token) {
    try {
      intent = verifyAuthIntentToken(token);
      state = "ready";
    } catch (error) {
      if (error instanceof AuthIntentTokenError && error.code === "expired") {
        intent = error.intent;
        state = "expired";
      }
    }
  }

  if (requestedState === "invalid") {
    intent = null;
    state = "invalid";
  } else if (requestedState === "expired" && state !== "ready") {
    state = "expired";
  }

  if (state === "ready" && token && session?.user?.id) {
    redirect(`/auth/intent/resume?intent=${encodeURIComponent(token)}`);
    return null;
  }

  return (
    <AuthIntentSurface
      locale={locale}
      intent={intent}
      token={state === "ready" ? token : null}
      state={state}
      facebookSignInEnabled={isFacebookSignInEnabled()}
      googleSignInEnabled={isGoogleSignInEnabled()}
      initialMessage={oauthErrorRecoveryMessage(params.error)}
    />
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
