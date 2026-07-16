import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SiteShell } from "@/components/site-shell/site-shell";
import { hasReadyCommunityNavigation } from "@/server/community-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { getSiteShellSessionState } from "@/server/site-shell-session";
import "./globals.css";
import { GoogleAnalytics } from "./google-analytics";
import { MetaMarketingAttribution } from "./meta-marketing";
import { ServiceWorkerRegister } from "./sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OverGarden",
  description:
    "Gardening journal + catalog-as-social-graph for Ukraine & Bulgaria.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, shellSession, communitiesReady] = await Promise.all([
    getRequestInterfaceLocale(),
    getSiteShellSessionState(),
    hasReadyCommunityNavigation().catch(() => false),
  ]);

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteShell
          locale={locale}
          isAuthenticated={shellSession.isAuthenticated}
          communitiesReady={communitiesReady}
        >
          {children}
        </SiteShell>
        <ServiceWorkerRegister />
        <GoogleAnalytics locale={locale} />
        <MetaMarketingAttribution locale={locale} />
      </body>
    </html>
  );
}
