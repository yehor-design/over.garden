"use client";

import Link from "next/link";
import { PlantIcon as Sprout } from "@/components/icons/Plant";

import { SignOutControl } from "@/components/auth/sign-out-control";
import { InterfaceLanguageControl } from "@/components/public/language-switcher";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { InterfaceMarket } from "@/lib/interface-market";
import { getInterfaceLanguageControlPlacement } from "@/lib/interface-route-policy";
import { getTrustClientCopy } from "@/lib/trust-client-copy";

export function AuthenticatedUtilityRegion({
  locale,
  market,
  pathname,
  isAuthenticated,
}: {
  locale: InterfaceLocale;
  market?: InterfaceMarket;
  pathname: string;
  isAuthenticated: boolean;
}) {
  const copy = getTrustClientCopy(locale).signOut;

  return (
    <nav
      data-authenticated-utility-region="true"
      aria-label={copy.operatorRegionLabel}
      className="sticky top-0 z-header flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-2 shadow-xs backdrop-blur sm:px-5"
    >
      <Link
        href="/garden"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <Sprout data-icon="inline-start" aria-hidden="true" />
        {copy.backToGarden}
      </Link>
      <div className="flex items-center gap-2">
        <InterfaceLanguageControl
          locale={locale}
          market={market}
          pathname={pathname}
          compact
        />
        {isAuthenticated ? <SignOutControl presentation="utility" /> : null}
      </div>
    </nav>
  );
}

export function isAuthenticatedUtilityPath(pathname: string) {
  return getInterfaceLanguageControlPlacement(pathname) === "utility";
}
