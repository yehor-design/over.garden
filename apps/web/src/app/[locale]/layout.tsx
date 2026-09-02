import type { Metadata } from "next";

import {
  getInterfaceCopy,
  INTERFACE_CONTEXT_META_NAME,
  resolveInterfaceLocalization,
  serializeInterfaceLocalizationHint,
} from "@/lib/interface-localization";
import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
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
    <RootDocument lang={localization.locale} localization={localization}>
      {children}
    </RootDocument>
  );
}

function localizationForRoute(value: string) {
  const routeLocale: PublicLocale = isPublicLocale(value)
    ? value
    : DEFAULT_PUBLIC_LOCALE;
  const { locale, market } = resolveInterfaceLocalization({ routeLocale });
  return { locale, market };
}
