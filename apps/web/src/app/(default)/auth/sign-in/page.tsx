import type { Metadata } from "next";

import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import { getAuthScreenCopy } from "@/lib/auth-screen-copy";
import { getCurrentSession } from "@/server/auth-session";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { AuthSurface } from "../auth-surface";
import { signInAction, startSocialSignInAction } from "../auth-actions";
import { resolveAuthCancelHref } from "../cancel-href";
import { readAuthScreenParams, type AuthScreenSearchParams } from "../params";
import { SignedInState } from "../signed-in-state";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getAuthScreenCopy(await getRequestInterfaceLocale());
  return {
    title: copy.signIn.title,
    robots: { index: false, follow: false },
  };
}

export default async function SignInRoute({
  searchParams,
}: {
  searchParams?: Promise<AuthScreenSearchParams>;
}) {
  const [params, locale, session] = await Promise.all([
    searchParams ?? Promise.resolve<AuthScreenSearchParams>({}),
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const screen = readAuthScreenParams(params, locale);

  // Somebody already signed in gets a state of their own, not a silent
  // redirect: one that made Back from the destination bounce forward again.
  if (session?.user?.id) {
    return (
      <SignedInState
        locale={locale}
        next={screen.next}
        hasNext={screen.hasNext}
        verified={screen.verification === "done"}
      />
    );
  }

  return (
    <AuthSurface
      mode="sign-in"
      locale={locale}
      next={screen.next}
      cancelHref={resolveAuthCancelHref(screen.next)}
      intentPrompt={screen.intentPrompt}
      notice={screen.notice}
      providerError={screen.providerError}
      verificationExpired={screen.verification === "expired"}
      googleSignInEnabled={isGoogleSignInEnabled()}
      submit={signInAction}
      startSocial={startSocialSignInAction}
    />
  );
}
