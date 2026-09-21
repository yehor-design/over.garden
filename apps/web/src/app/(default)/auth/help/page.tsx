import type { Metadata } from "next";
import Link from "next/link";
import { EnvelopeSimpleIcon as MailWarning } from "@/components/icons/EnvelopeSimple";

import { buttonVariants } from "@/components/ui/button";
import { SIGN_IN_PATH } from "@/lib/navigation/sign-in-href";
import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { PasswordResetRequestForm } from "./password-reset-request-form";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getTrustSurfaceCopy(await getRequestInterfaceLocale()).authHelp;
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

export default async function AuthHelpPage() {
  const locale = await getRequestInterfaceLocale();
  const copy = getTrustSurfaceCopy(locale).authHelp;

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-10 sm:px-8"
    >
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>

      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <p className="text-sm font-medium text-muted-foreground">
          {copy.eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
      </header>

      <PasswordResetRequestForm locale={locale} />

      {/* Three answerable questions, each with its own heading, instead of one
          muted paragraph doing the work of three. A reader arrives here with
          exactly one of these problems and should not have to read the other
          two to find theirs. */}
      <div data-auth-help-sections="true" className="grid gap-4">
        <section className="grid gap-2 rounded-lg border border-border p-5">
          <h2 className="text-h4 text-text-heading">
            {copy.sections.emailTitle}
          </h2>
          <p className="text-body-sm leading-6 text-text-secondary">
            {copy.sections.emailBody}
          </p>
        </section>

        <section className="grid gap-2 rounded-lg border border-border p-5">
          <h2 className="text-h4 text-text-heading">
            {copy.sections.passwordTitle}
          </h2>
          <p className="text-body-sm leading-6 text-text-secondary">
            {copy.sections.passwordBody}
          </p>
        </section>

        <section className="grid gap-2 rounded-lg border border-border bg-surface-sunken p-5">
          <h2 className="flex items-center gap-2 text-h4 text-text-heading">
            <MailWarning aria-hidden="true" className="size-4 shrink-0" />
            {copy.sections.supportTitle}
          </h2>
          <p className="text-body-sm leading-6 text-text-secondary">
            {copy.sections.supportBody}
          </p>
          <p className="text-body-sm">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-link rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>
      </div>

      <Link
        href={SIGN_IN_PATH}
        className={buttonVariants({
          variant: "secondary",
          className: "justify-self-start",
        })}
      >
        {copy.backToSignIn}
      </Link>
    </main>
  );
}
