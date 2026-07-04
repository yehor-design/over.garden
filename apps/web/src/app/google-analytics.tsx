"use client";

import { useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-71LP7XZ5NE";
const GOOGLE_ANALYTICS_CONSENT_STORAGE_KEY = "overgarden:analytics-consent";
const GOOGLE_ANALYTICS_CONSENT_EVENT = "overgarden:analytics-consent-change";
const PUBLIC_LOCALE_PREFIX_PATTERN = /^\/(?:uk|bg|ru)(?=\/|$)/;
const GOOGLE_ANALYTICS_ALLOWED_EXACT_PATHS = new Set([
  "/",
  "/blog",
  "/privacy",
  "/support",
  "/first-publication-disclosure",
]);
const GOOGLE_ANALYTICS_ALLOWED_PREFIXES = [
  "/answers/",
  "/blog/",
  "/guides/",
  "/markets/",
] as const;
type GoogleAnalyticsConsent = "accepted" | "declined" | "undecided";

export function GoogleAnalytics() {
  const pathname = usePathname();
  const storedConsent = useSyncExternalStore(
    subscribeToGoogleAnalyticsConsent,
    readStoredGoogleAnalyticsConsent,
    getServerGoogleAnalyticsConsent,
  );
  const [sessionConsent, setSessionConsent] =
    useState<GoogleAnalyticsConsent | null>(null);
  const consent = sessionConsent ?? storedConsent;
  const isAllowedRoute = isGoogleAnalyticsRoute(pathname);

  const setStoredConsent = (nextConsent: GoogleAnalyticsConsent) => {
    if (nextConsent !== "undecided") {
      writeStoredGoogleAnalyticsConsent(nextConsent);
    }
    setSessionConsent(nextConsent);
  };

  if (!isAllowedRoute) return null;

  if (consent === "accepted") return <GoogleAnalyticsScripts />;
  if (consent === "declined") return null;

  return (
    <AnalyticsConsentBanner
      onAccept={() => setStoredConsent("accepted")}
      onDecline={() => setStoredConsent("declined")}
    />
  );
}

export function GoogleAnalyticsScripts() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics-gtag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', { analytics_storage: 'granted' });
          gtag('js', new Date());
          gtag('config', '${GOOGLE_ANALYTICS_MEASUREMENT_ID}');
        `}
      </Script>
    </>
  );
}

export function isGoogleAnalyticsRoute(pathname: string | null): boolean {
  if (!pathname) return false;

  const normalizedPath = stripPublicLocale(pathname);
  if (GOOGLE_ANALYTICS_ALLOWED_EXACT_PATHS.has(normalizedPath)) return true;

  return GOOGLE_ANALYTICS_ALLOWED_PREFIXES.some((prefix) =>
    normalizedPath.startsWith(prefix),
  );
}

function stripPublicLocale(pathname: string): string {
  const stripped = pathname.replace(PUBLIC_LOCALE_PREFIX_PATTERN, "");
  return stripped || "/";
}

function AnalyticsConsentBanner({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      aria-label="Analytics consent"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-md border bg-background/95 p-4 text-foreground shadow-lg backdrop-blur sm:bottom-5 sm:flex sm:items-center sm:gap-4"
      role="dialog"
    >
      <p className="text-sm leading-6 text-muted-foreground">
        We use Google Analytics only on public, legal, and support pages to
        understand what helps gardeners reach OverGarden. It does not run on
        private garden, auth, admin, or journal pages.
      </p>
      <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
        <Button onClick={onAccept} size="sm" type="button">
          Accept analytics
        </Button>
        <Button onClick={onDecline} size="sm" type="button" variant="outline">
          Decline
        </Button>
      </div>
    </div>
  );
}

export function readStoredGoogleAnalyticsConsent(): GoogleAnalyticsConsent {
  if (typeof window === "undefined") return "undecided";

  try {
    const stored = window.localStorage.getItem(
      GOOGLE_ANALYTICS_CONSENT_STORAGE_KEY,
    );
    return stored === "accepted" || stored === "declined"
      ? stored
      : "undecided";
  } catch {
    return "undecided";
  }
}

function writeStoredGoogleAnalyticsConsent(
  consent: Exclude<GoogleAnalyticsConsent, "undecided">,
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      GOOGLE_ANALYTICS_CONSENT_STORAGE_KEY,
      consent,
    );
  } catch {
    // Private browsing or storage-denied contexts must not block the UI choice.
  }
  window.dispatchEvent(new Event(GOOGLE_ANALYTICS_CONSENT_EVENT));
}

function subscribeToGoogleAnalyticsConsent(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const handleChange = () => onStoreChange();
  window.addEventListener(GOOGLE_ANALYTICS_CONSENT_EVENT, handleChange);
  window.addEventListener("storage", handleChange);

  return () => {
    window.removeEventListener(GOOGLE_ANALYTICS_CONSENT_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}

function getServerGoogleAnalyticsConsent(): GoogleAnalyticsConsent {
  return "undecided";
}
