"use client";

import Link from "next/link";
import { Sprout } from "lucide-react";

import { SignOutControl } from "@/components/auth/sign-out-control";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { stripLocalePrefix } from "@/lib/public-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

const AUTHENTICATED_UTILITY_PREFIXES = [
  "/admin",
  "/garden/catalog/curation",
  "/garden/pilot-health",
  "/garden/pilot-learning",
  "/garden/pilot-smoke",
  "/garden/privacy/erasure-requests",
] as const;

export function AuthenticatedUtilityRegion({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const copy = getTrustSurfaceCopy(locale).signOut;

  return (
    <nav
      data-authenticated-utility-region="true"
      aria-label={copy.operatorRegionLabel}
      className="sticky top-0 z-50 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-2 shadow-xs backdrop-blur sm:px-5"
    >
      <Link
        href="/garden"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <Sprout data-icon="inline-start" aria-hidden="true" />
        {copy.backToGarden}
      </Link>
      <SignOutControl presentation="utility" />
    </nav>
  );
}

export function isAuthenticatedUtilityPath(pathname: string) {
  const normalizedPath = stripLocalePrefix(pathname).path;
  return AUTHENTICATED_UTILITY_PREFIXES.some(
    (prefix) =>
      normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
}
