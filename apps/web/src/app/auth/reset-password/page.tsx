import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  description:
    "Set a new password for your OverGarden closed-pilot account and return to your garden.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>

      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading sign-in help…</p>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
