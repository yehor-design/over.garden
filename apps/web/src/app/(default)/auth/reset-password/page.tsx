import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
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

export default async function ResetPasswordPage() {
  const locale = await getRequestInterfaceLocale();
  const copy = getTrustSurfaceCopy(locale).resetPassword;

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-10 sm:px-8"
    >
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>

      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">{copy.loading}</p>
        }
      >
        <ResetPasswordForm locale={locale} />
      </Suspense>
    </main>
  );
}
