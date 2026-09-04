import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isGoogleSignInEnabled } from "@/lib/auth/google-oauth";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { getCurrentSession } from "@/server/auth-session";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { AuthSurface } from "../auth-surface";
import { signUpAction, startSocialSignInAction } from "../auth-actions";
import { readAuthScreenParams, type AuthScreenSearchParams } from "../params";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getTrustSurfaceCopy(await getRequestInterfaceLocale()).authPanel;
  return {
    title: copy.signUpScreenTitle,
    robots: { index: false, follow: false },
  };
}

export default async function SignUpRoute({
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

  // Somebody already signed in does not need this screen; send them on to the
  // thing they were doing.
  if (session?.user?.id) redirect(screen.next);

  return (
    <AuthSurface
      mode="sign-up"
      locale={locale}
      next={screen.next}
      intentPrompt={screen.intentPrompt}
      googleSignInEnabled={isGoogleSignInEnabled()}
      submit={signUpAction}
      startSocial={startSocialSignInAction}
    />
  );
}
