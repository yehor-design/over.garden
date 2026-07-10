"use client";

import { createContext, useContext } from "react";

import type { InterfaceLocale } from "@/lib/interface-localization";

const SiteShellLocaleContext = createContext<InterfaceLocale>("uk");

export function SiteShellLocaleProvider({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: InterfaceLocale;
}) {
  return (
    <SiteShellLocaleContext.Provider value={locale}>
      {children}
    </SiteShellLocaleContext.Provider>
  );
}

export function useSiteShellLocale() {
  return useContext(SiteShellLocaleContext);
}
