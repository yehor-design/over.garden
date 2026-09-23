import type { Metadata } from "next";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { getAuthScreenCopy } from "@/lib/auth-screen-copy";
import { AUTH_HELP_PATH } from "@/lib/auth/auth-recovery";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { resetPasswordAction } from "../auth-actions";
import { AuthFrame } from "../auth-frame";
import { ResetPasswordForm } from "./reset-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getTrustSurfaceCopy(
    await getRequestInterfaceLocale(),
  ).resetPassword;
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

/**
 * Setting a new password from the emailed link (`OVE-504`: the same focused
 * column as sign-in).
 *
 * The link either arrives with a `token`, or — when Better Auth refused it on
 * the way here — with `error=INVALID_TOKEN`. The second is its own state with
 * its own next step, a new link, rather than a form that can only fail. Both
 * are decided on the server from the address, so the screen is complete before
 * any script runs; it used to read the token in the browser and show "loading"
 * until it had.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [locale, params] = await Promise.all([
    getRequestInterfaceLocale(),
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
  ]);
  const copy = getTrustSurfaceCopy(locale).resetPassword;
  const screen = getAuthScreenCopy(locale);
  const token = first(params.token).trim();
  const refused = first(params.error).length > 0;
  const signInLink = (
    <Link href={buildSignInHref()} className="justify-self-start">
      {screen.help.back}
    </Link>
  );

  if (refused || token.length === 0) {
    return (
      <AuthFrame
        locale={locale}
        screen="reset-password"
        title={screen.reset.expiredTitle}
        description={screen.reset.expiredDescription}
        footer={signInLink}
      >
        <div data-reset-link-state="expired" className="grid">
          <a
            href={`${AUTH_HELP_PATH}#password-reset`}
            className={buttonVariants({ className: "justify-self-start" })}
          >
            {screen.reset.requestNew}
          </a>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      locale={locale}
      screen="reset-password"
      title={copy.title}
      description={copy.description}
      footer={signInLink}
    >
      <ResetPasswordForm
        locale={locale}
        token={token}
        reset={resetPasswordAction}
      />
    </AuthFrame>
  );
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
