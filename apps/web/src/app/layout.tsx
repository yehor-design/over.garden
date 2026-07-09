import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { getRequestInterfaceLocale } from "@/server/interface-localization";
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
  const locale = await getRequestInterfaceLocale();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorkerRegister />
        <GoogleAnalytics locale={locale} />
        <MetaMarketingAttribution />
      </body>
    </html>
  );
}
