import type { Metadata } from "next";

import { PublicArticle } from "@/components/public/public-article";
import { Link } from "@/components/ui/link";
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
    <PublicArticle
      locale={locale}
      dataset={{ "data-trust-surface": "support" }}
      title={copy.title}
      description={
        <>
          {copy.introBeforeEmail}
          <Link href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</Link>
          {copy.introAfterEmail} {copy.statusLabel}.
        </>
      }
      contentsLabel={copy.pathsTitle}
      sections={[
        {
          id: "support-paths",
          heading: copy.pathsTitle,
          body: (
            <ul className="grid list-disc gap-2 pl-5 text-text-secondary">
              <li>
                {copy.accountBeforeLink}
                <Link href="/auth/help">{copy.accountLink}</Link>
                {copy.accountAfterLink}
              </li>
              <li>
                {copy.erasureBeforeLink}
                <Link href="/erasure">{copy.erasureLink}</Link>
                {copy.erasureAfterLink}
              </li>
              <li>
                {copy.privacyBeforeLink}
                <Link href={localizedPath(locale, "/privacy")}>
                  {copy.privacyLink}
                </Link>
                {copy.privacyAfterLink}
              </li>
            </ul>
          ),
        },
      ]}
    />
  );
}
