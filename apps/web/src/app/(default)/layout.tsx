import type { Metadata } from "next";

import {
  getInterfaceCopy,
  INTERFACE_CONTEXT_META_NAME,
  serializeInterfaceLocalizationHint,
} from "@/lib/interface-localization";
import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";
import { getRequestInterfaceLocalization } from "@/server/interface-localization";
import { RootDocument } from "@/app/root-document";

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

/**
 * The root layout of every unprefixed route (ADR-0022, D4): the default
 * locale's public pages and the workspace. The interface locale of the
 * workspace is resolved at request time inside the document's Suspense hole.
 */
export default function DefaultRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <RootDocument lang={DEFAULT_PUBLIC_LOCALE} localization={null}>
      {children}
    </RootDocument>
  );
}
