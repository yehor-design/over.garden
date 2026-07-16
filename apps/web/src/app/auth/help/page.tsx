import type { Metadata } from "next";
import Link from "next/link";
import { MailWarning } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
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

      <section className="grid gap-4 rounded-lg border border-border p-5">
        <h2 className="text-base font-semibold text-foreground">
          {copy.nextTitle}
        </h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
          <li>{copy.stepOne}</li>
          <li>
            {copy.stepTwoBeforeEmail}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            {copy.stepTwoAfterEmail}
          </li>
          <li>
            {copy.stepThreeBeforeGarden}
            <Link href="/garden" className="font-medium text-primary">
              {copy.stepThreeGardenLink}
            </Link>{" "}
            {copy.stepThreeAfterGarden}
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MailWarning className="size-4" />
          {copy.fallbackTitle}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.fallbackBody}
        </p>
        <Link href="/garden" className={buttonVariants({ variant: "outline" })}>
          {copy.backToSignIn}
        </Link>
      </section>
    </main>
  );
}
