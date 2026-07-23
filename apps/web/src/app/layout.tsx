import type { Metadata } from "next";
import { headers } from "next/headers";

import { InterfaceLocaleChangeBoundary } from "@/components/site-shell/interface-locale-change-boundary";
import { SiteShell } from "@/components/site-shell/site-shell";
import {
  getInterfaceCopy,
  INTERFACE_CONTEXT_META_NAME,
  serializeInterfaceLocalizationHint,
} from "@/lib/interface-localization";
import { INTERFACE_GLOBAL_ERROR_VISUAL_FIXTURE_HEADER } from "@/lib/localization/localization-visual-fixture";
import {
  GoogleSansPreloads,
  preloadGoogleSans,
} from "@/lib/typography/google-sans-preloads";
import { hasReadyCommunityNavigation } from "@/server/community-repository";
import { getRequestInterfaceLocalization } from "@/server/interface-localization";
import { getSiteShellSessionState } from "@/server/site-shell-session";
import "./geist-mono.css";
import "./globals.css";
import "./google-sans.css";
import { GoogleAnalytics } from "./google-analytics";
import { MetaMarketingAttribution } from "./meta-marketing";
import { ServiceWorkerRegister } from "./sw-register";

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
  // Register critical font hints before the first suspension so React can
  // promote them into the initial response's Link header.
  preloadGoogleSans();
  const requestHeaders = await headers();
  if (
    requestHeaders.get(INTERFACE_GLOBAL_ERROR_VISUAL_FIXTURE_HEADER) === "1"
  ) {
    return (
      <html lang="uk" className="h-full antialiased">
        <head>
          <GoogleSansPreloads />
        </head>
        <body>
          <GlobalErrorVisualFixture />
        </body>
      </html>
    );
  }

  const [localization, shellSession, communitiesReady] = await Promise.all([
    getRequestInterfaceLocalization(),
    getSiteShellSessionState(),
    hasReadyCommunityNavigation().catch(() => false),
  ]);
  const { locale, market } = localization;

  return (
    <html lang={locale} className="h-full antialiased">
      <head>
        <GoogleSansPreloads />
      </head>
      <body className="flex min-h-full flex-col">
        <InterfaceLocaleChangeBoundary>
          <SiteShell
            locale={locale}
            market={market}
            isAuthenticated={shellSession.isAuthenticated}
            communitiesReady={communitiesReady}
          >
            {children}
          </SiteShell>
        </InterfaceLocaleChangeBoundary>
        <ServiceWorkerRegister />
        <GoogleAnalytics locale={locale} />
        <MetaMarketingAttribution locale={locale} />
      </body>
    </html>
  );
}

function GlobalErrorVisualFixture(): React.ReactNode {
  throw new Error("Deterministic localization global-error fixture.");
}
