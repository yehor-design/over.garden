import type { Metadata } from "next";

import { InterfaceLocaleChangeBoundary } from "@/components/site-shell/interface-locale-change-boundary";
import { SiteShell } from "@/components/site-shell/site-shell";
import { OWNER_USER_ID_DOCUMENT_ATTRIBUTE } from "@/lib/auth/owner-scope-contract";
import {
  getInterfaceCopy,
  INTERFACE_CONTEXT_META_NAME,
  serializeInterfaceLocalizationHint,
} from "@/lib/interface-localization";
import { hasReadyCommunityNavigation } from "@/server/community-repository";
import { getRequestInterfaceLocalization } from "@/server/interface-localization";
import "./globals.css";
import { geistMono, googleSans } from "./fonts";
import { GoogleAnalytics } from "./google-analytics";
import { MetaMarketingAttribution } from "./meta-marketing";

type SiteShellSessionState = {
  isAuthenticated: boolean;
  ownerUserId: string | null;
  hasOperatorAccess: boolean;
};

const ROOT_LAYOUT_GUEST_SESSION_STATE: SiteShellSessionState = {
  isAuthenticated: false,
  ownerUserId: null,
  hasOperatorAccess: false,
};

export async function generateMetadata(): Promise<Metadata> {
  const { locale, market } = await getRequestInterfaceLocalization();
  const copy = getInterfaceCopy(locale).metadata;

  return {
    title: copy.siteTitle,
    description: copy.siteDescription,
    other: {
      [INTERFACE_CONTEXT_META_NAME]: serializeInterfaceLocalizationHint({
        market,
        locale,
      }),
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [localization, shellSession, communitiesReady] = await Promise.all([
    getRequestInterfaceLocalization(),
    getShellSessionState(),
    hasReadyCommunityNavigation().catch(() => false),
  ]);
  const { locale, market } = localization;

  return (
    <html
      lang={locale}
      className={`${googleSans.variable} ${geistMono.variable} h-full antialiased`}
      {...(shellSession.ownerUserId
        ? { [OWNER_USER_ID_DOCUMENT_ATTRIBUTE]: shellSession.ownerUserId }
        : {})}
    >
      <body className="flex min-h-full flex-col">
        <InterfaceLocaleChangeBoundary>
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
        </InterfaceLocaleChangeBoundary>
        <GoogleAnalytics locale={locale} />
        <MetaMarketingAttribution locale={locale} />
      </body>
    </html>
  );
}

async function getShellSessionState(): Promise<SiteShellSessionState> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return ROOT_LAYOUT_GUEST_SESSION_STATE;
  }

  try {
    const { getSiteShellSessionState } =
      await import("@/server/site-shell-session");

    return await getSiteShellSessionState();
  } catch {
    return ROOT_LAYOUT_GUEST_SESSION_STATE;
  }
}
