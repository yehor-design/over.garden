import type { Metadata } from "next";
import Link from "next/link";
import { MailWarning } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  passwordResetHelpMessage,
  signInRecoveryHint,
} from "@/lib/auth/pilot-auth-recovery";
import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import { PasswordResetRequestForm } from "./password-reset-request-form";

export const metadata: Metadata = {
  title: "Sign-in help",
  description:
    "Sign-in help for OverGarden gardeners who need to return to an existing garden.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthHelpPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>

      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <p className="text-sm font-medium text-muted-foreground">
          Account recovery
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Need help signing in?
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {passwordResetHelpMessage()}
        </p>
      </header>

      <PasswordResetRequestForm />

      <section className="grid gap-4 rounded-lg border border-border p-5">
        <h2 className="text-base font-semibold text-foreground">
          What to do next
        </h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
          <li>
            Use the same email address you used when you first joined the pilot.
            Creating another account will not move your existing plant records.
          </li>
          <li>
            If the email reset does not arrive, contact{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            or whoever invited you. Support can send a private one-time link to
            set a new password.
          </li>
          <li>
            After you sign in again, open{" "}
            <Link href="/garden" className="font-medium text-primary">
              your garden
            </Link>{" "}
            to confirm your plant objects and entries are still there.
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MailWarning className="size-4" />
          Closed-pilot fallback
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          {signInRecoveryHint()} This keeps support small and safe while the
          pilot is invite-only.
        </p>
        <Link href="/garden" className={buttonVariants({ variant: "outline" })}>
          Back to garden sign-in
        </Link>
      </section>
    </main>
  );
}
