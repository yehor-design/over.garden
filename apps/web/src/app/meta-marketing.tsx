"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  META_MARKETING_CONSENT_STORAGE_KEY,
  resolveMetaMarketingPublicConfig,
} from "@/lib/meta-marketing/events";
import {
  readStoredMetaMarketingConsent,
  subscribeToMetaMarketingConsent,
  trackMetaMarketingEvent,
  writeStoredMetaMarketingConsent,
} from "@/lib/meta-marketing/client";
import type { MetaMarketingConsent } from "@/lib/meta-marketing/events";

const PUBLIC_LOCALE_PREFIX_PATTERN = /^\/(?:uk|bg|ru)(?=\/|$)/;
const META_MARKETING_ALLOWED_EXACT_PATHS = new Set([
  "/",
  "/blog",
  "/privacy",
  "/support",
  "/first-publication-disclosure",
]);
const META_MARKETING_ALLOWED_PREFIXES = [
  "/answers/",
  "/blog/",
  "/guides/",
  "/markets/",
] as const;

export function MetaMarketingAttribution() {
  const pathname = usePathname();
  const config = resolveMetaMarketingPublicConfig();
  const storedConsent = useSyncExternalStore(
    subscribeToMetaMarketingConsent,
    readStoredMetaMarketingConsent,
    getServerMetaMarketingConsent,
  );
  const [sessionConsent, setSessionConsent] =
    useState<MetaMarketingConsent | null>(null);
  const consent = sessionConsent ?? storedConsent;
  const isAllowedRoute = isMetaMarketingRoute(pathname);

  const setConsent = (nextConsent: Exclude<MetaMarketingConsent, "undecided">) => {
    writeStoredMetaMarketingConsent(nextConsent);
    setSessionConsent(nextConsent);
  };

  if (!config.enabled || !config.pixelId || !isAllowedRoute) return null;

  if (consent === "accepted") {
    return (
      <>
        <MetaPixelScripts pixelId={config.pixelId} />
        <MetaMarketingPublicRouteTracker pathname={pathname ?? "/"} />
      </>
    );
  }

  if (consent === "declined") return null;

  return (
    <MetaMarketingConsentBanner
      onAccept={() => setConsent("accepted")}
      onDecline={() => setConsent("declined")}
    />
  );
}

export function MetaMarketingPrivacyControls() {
  const config = resolveMetaMarketingPublicConfig();
  const storedConsent = useSyncExternalStore(
    subscribeToMetaMarketingConsent,
    readStoredMetaMarketingConsent,
    getServerMetaMarketingConsent,
  );
  const [sessionConsent, setSessionConsent] =
    useState<MetaMarketingConsent | null>(null);
  const consent = sessionConsent ?? storedConsent;
  const statusLabel = config.enabled
    ? consent === "accepted"
      ? "Allowed"
      : consent === "declined"
        ? "Off"
        : "Not chosen"
    : "Off for this deployment";

  const setConsent = (nextConsent: Exclude<MetaMarketingConsent, "undecided">) => {
    writeStoredMetaMarketingConsent(nextConsent);
    setSessionConsent(nextConsent);
  };

  return (
    <section className="grid gap-2 rounded-lg border border-border p-4">
      <h2 className="text-base font-semibold text-foreground">
        Meta marketing measurement
      </h2>
      <p className="text-muted-foreground">
        Status: <strong>{statusLabel}</strong>. When enabled and explicitly
        allowed, OverGarden may send Meta Ads only allowlisted event classes
        such as a public landing-page view or first private entry saved. It does
        not send journal text, private plant names, catalog selections, precise
        location, media keys, auth callback data, emails, account identifiers,
        cookies, IP address, or user-agent evidence.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => setConsent("accepted")}
          disabled={!config.enabled}
        >
          Allow marketing measurement
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setConsent("declined")}
        >
          Turn off
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Preference key: {META_MARKETING_CONSENT_STORAGE_KEY}. Turning this off
        revokes future browser Pixel events and stops OverGarden from queueing
        Meta Conversions API events from this browser.
      </p>
    </section>
  );
}

export function MetaPixelScripts({ pixelId }: { pixelId: string }) {
  const pixelIdLiteral = JSON.stringify(pixelId);

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('consent', 'grant');
        fbq('set', 'autoConfig', false, ${pixelIdLiteral});
        fbq('init', ${pixelIdLiteral});
      `}
    </Script>
  );
}

export function isMetaMarketingRoute(pathname: string | null): boolean {
  if (!pathname) return false;

  const normalizedPath = stripPublicLocale(pathname);
  if (META_MARKETING_ALLOWED_EXACT_PATHS.has(normalizedPath)) return true;

  return META_MARKETING_ALLOWED_PREFIXES.some((prefix) =>
    normalizedPath.startsWith(prefix),
  );
}

function MetaMarketingPublicRouteTracker({
  pathname,
}: {
  pathname: string;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void trackMetaMarketingEvent("landing_page_view");
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}

function MetaMarketingConsentBanner({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      aria-label="Meta marketing measurement consent"
      className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-3xl rounded-md border bg-background/95 p-4 text-foreground shadow-lg backdrop-blur sm:bottom-28 sm:flex sm:items-center sm:gap-4"
      role="dialog"
    >
      <p className="text-sm leading-6 text-muted-foreground">
        OverGarden can measure Meta ad visits only if you allow marketing
        measurement. It runs only on public, legal, and support pages and sends
        allowlisted event classes, never private garden text, precise location,
        media, auth, or account identifiers.
      </p>
      <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
        <Button onClick={onAccept} size="sm" type="button">
          Allow marketing measurement
        </Button>
        <Button onClick={onDecline} size="sm" type="button" variant="outline">
          Keep off
        </Button>
      </div>
    </div>
  );
}

function stripPublicLocale(pathname: string): string {
  const stripped = pathname.replace(PUBLIC_LOCALE_PREFIX_PATTERN, "");
  return stripped || "/";
}

function getServerMetaMarketingConsent(): MetaMarketingConsent {
  return "undecided";
}
