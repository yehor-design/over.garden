import type { Metadata } from "next";

import {
  getInterfaceCopy,
  INTERFACE_CONTEXT_META_NAME,
  resolveInterfaceLocalization,
  serializeInterfaceLocalizationHint,
} from "@/lib/interface-localization";
import { DEFAULT_INTERFACE_MARKET } from "@/lib/interface-market";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import { getPublicSiteUrl } from "@/lib/runtime-url";
import { RootDocument } from "@/app/root-document";

interface LocaleRootLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Pick<LocaleRootLayoutProps, "params">): Promise<Metadata> {
  const { locale, market } = localizationForRoute((await params).locale);
  const copy = getInterfaceCopy(locale).metadata;

  return {
    // ADR-0029 D1: one absolute origin. Anything a page leaves relative — an
    // Open Graph image, a manifest — resolves against this rather than against
    // the deployment host Next would otherwise guess.
    metadataBase: new URL(getPublicSiteUrl()),
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

/**
 * The root layout of every locale-prefixed route (ADR-0022, D4): the document
 * language comes from the route, so the shell prerenders per locale.
 */
export default async function LocaleRootLayout({
  children,
  params,
}: LocaleRootLayoutProps) {
  const localization = localizationForRoute((await params).locale);

  return (
    // The document's language is the route's and stays static for the tree.
    // The shell's is the reader's, resolved in the document's Suspense hole
    // the way the unprefixed tree has always resolved it: this subtree is now
    // where an unprefixed address renders for a reader who chose this
    // language, and the market that decides what the language control offers
    // is a fact about the reader, not about the prefix they were rewritten
    // into.
    <RootDocument lang={localization.locale} localization={null}>
      {children}
    </RootDocument>
  );
}

function localizationForRoute(value: string) {
  const routeLocale: PublicLocale = isPublicLocale(value)
    ? value
    : DEFAULT_PUBLIC_LOCALE;
  const { locale } = resolveInterfaceLocalization({ routeLocale });
  // A prerendered document has no reader, so the hint claims the fallback
  // market and nothing cleverer.
  //
  // It used to claim "the market this language is the default of", which is a
  // market read out of a language — the one move the contract forbids. It was
  // wrong in the ordinary case and measurably so: a reader in Bulgaria whose
  // language is Russian renders from the `/ru` subtree, and the document told
  // the error boundary they were in Ukraine. The locale is still the route's,
  // which is correct and is all this document knows; the reader's real market
  // arrives from `/api/interface/context` if the boundary ever needs it.
  return { locale, market: DEFAULT_INTERFACE_MARKET };
}
