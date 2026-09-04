import { connection } from "next/server";
import { Suspense } from "react";

import { RootLoadingSkeleton } from "@/components/site-shell/root-loading-skeleton";
import { SiteShell } from "@/components/site-shell/site-shell";
import { OWNER_USER_ID_DOCUMENT_ATTRIBUTE } from "@/lib/auth/owner-scope-contract";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { InterfaceMarket } from "@/lib/interface-market";
import { readCommunityNavigationReadiness } from "@/server/public-cache";
import { getRequestInterfaceLocalization } from "@/server/interface-localization";
import {
  GUEST_SITE_SHELL_SESSION_STATE,
  getSiteShellSessionState,
  type SiteShellSessionState,
} from "@/server/site-shell-session";
import { geistMono, googleSans } from "@/app/fonts";
import { GoogleAnalytics } from "@/app/google-analytics";
import { MetaMarketingAttribution } from "@/app/meta-marketing";
import "@/app/globals.css";

export interface RootDocumentLocalization {
  locale: InterfaceLocale;
  market: InterfaceMarket;
}

/**
 * The document every root layout renders (ADR-0022, D4). `<html>` and
 * `<body>` are static; everything that depends on the request (the interface
 * locale of unprefixed routes, the session, community readiness) streams from
 * one Suspense hole so the shell can be prerendered.
 */
export function RootDocument({
  lang,
  localization,
  children,
}: {
  /** The document language; static for the whole route tree. */
  lang: InterfaceLocale;
  /** Known from the route for `[locale]`; resolved at request time otherwise. */
  localization: RootDocumentLocalization | null;
  children: React.ReactNode;
}) {
  return (
    <html
      lang={lang}
      className={`${googleSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Suspense fallback={<RootLoadingSkeleton />}>
          <RootDocumentShell localization={localization}>
            {children}
          </RootDocumentShell>
        </Suspense>
      </body>
    </html>
  );
}

/** The request-time part of the document: locale, session, and the shell. */
export async function RootDocumentShell({
  localization,
  children,
}: {
  localization: RootDocumentLocalization | null;
  children: React.ReactNode;
}) {
  await connection();
  const { locale, market } =
    localization ?? (await getRequestInterfaceLocalization());
  const [shellSession, communitiesReady] = await Promise.all([
    getShellSessionState(),
    readCommunityNavigationReadiness().catch(() => false),
  ]);

  return (
    <div
      lang={locale}
      className="contents"
      {...(shellSession.ownerUserId
        ? { [OWNER_USER_ID_DOCUMENT_ATTRIBUTE]: shellSession.ownerUserId }
        : {})}
    >
      <SiteShell
        locale={locale}
        market={market}
        isAuthenticated={shellSession.isAuthenticated}
        ownerUserId={shellSession.ownerUserId}
        hasOperatorAccess={shellSession.hasOperatorAccess}
        communitiesReady={communitiesReady}
      >
        {children}
      </SiteShell>
      <GoogleAnalytics locale={locale} />
      <MetaMarketingAttribution locale={locale} />
    </div>
  );
}

async function getShellSessionState(): Promise<SiteShellSessionState> {
  try {
    return await getSiteShellSessionState();
  } catch {
    return GUEST_SITE_SHELL_SESSION_STATE;
  }
}
