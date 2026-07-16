import type { Metadata } from "next";
import Link from "next/link";

import { SUPPORT_EMAIL } from "@/lib/privacy/disclosures";
import { localizedPath } from "@/lib/public-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getTrustSurfaceCopy(await getRequestInterfaceLocale()).support;
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

export default async function SupportPage() {
  const locale = await getRequestInterfaceLocale();
  const copy = getTrustSurfaceCopy(locale).support;

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8"
    >
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.introBeforeEmail}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          {copy.introAfterEmail} {copy.statusLabel}.
        </p>
      </header>
      <section className="grid gap-3 text-sm leading-6 text-foreground">
        <h2 className="text-base font-semibold text-foreground">
          {copy.pathsTitle}
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            {copy.accountBeforeLink}
            <Link
              href="/auth/help"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {copy.accountLink}
            </Link>
            {copy.accountAfterLink}
          </li>
          <li>
            {copy.erasureBeforeLink}
            <Link
              href="/erasure"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {copy.erasureLink}
            </Link>
            {copy.erasureAfterLink}
          </li>
          <li>
            {copy.privacyBeforeLink}
            <Link
              href={localizedPath(locale, "/privacy")}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {copy.privacyLink}
            </Link>
            {copy.privacyAfterLink}
          </li>
        </ul>
      </section>
    </main>
  );
}
