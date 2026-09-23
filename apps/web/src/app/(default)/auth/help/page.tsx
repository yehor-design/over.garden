import type { Metadata } from "next";

import { Link } from "@/components/ui/link";
import { getAuthScreenCopy } from "@/lib/auth-screen-copy";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { requestPasswordResetAction } from "../auth-actions";
import { AuthFrame } from "../auth-frame";
import { PasswordResetRequestForm } from "./password-reset-request-form";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getTrustSurfaceCopy(await getRequestInterfaceLocale()).authHelp;
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

/**
 * The help screen: send yourself a reset link, and three answers for when it
 * does not arrive (`OVE-504`: the same focused column as sign-in).
 *
 * The way back carries the reader's `next`, so a detour through help does
 * not cost them the page they were signing in for.
 */
export default async function AuthHelpPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [locale, params] = await Promise.all([
    getRequestInterfaceLocale(),
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
  ]);
  const copy = getTrustSurfaceCopy(locale).authHelp;
  const screen = getAuthScreenCopy(locale);
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = normalizeInternalReturnPath(rawNext, "/garden");

  return (
    <AuthFrame
      locale={locale}
      screen="help"
      title={screen.help.title}
      description={screen.help.description}
      footer={
        <Link
          href={buildSignInHref({ returnTo: next })}
          className="justify-self-start"
          data-auth-help-back="true"
        >
          {screen.help.back}
        </Link>
      }
    >
      <PasswordResetRequestForm
        locale={locale}
        request={requestPasswordResetAction}
      />

      {/* Three answerable questions, each with its own heading. A reader
          arrives here with exactly one of these problems and should not have
          to read the other two to find theirs. */}
      <div
        data-auth-help-sections="true"
        className="grid divide-y divide-border border-t border-border"
      >
        <section className="grid gap-1 py-4">
          <h2 className="text-h4 text-text-heading">
            {copy.sections.emailTitle}
          </h2>
          <p className="text-body-sm text-text-secondary">
            {copy.sections.emailBody}
          </p>
        </section>

        <section className="grid gap-1 py-4">
          <h2 className="text-h4 text-text-heading">
            {copy.sections.passwordTitle}
          </h2>
          <p className="text-body-sm text-text-secondary">
            {copy.sections.passwordBody}
          </p>
        </section>

        <section className="grid gap-1 py-4">
          <h2 className="text-h4 text-text-heading">
            {copy.sections.supportTitle}
          </h2>
          <p className="text-body-sm text-text-secondary">
            {copy.sections.supportBody}
          </p>
          <p className="text-body-sm">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-link hover:text-link-hover rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>
      </div>
    </AuthFrame>
  );
}
