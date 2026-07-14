"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";

const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-71LP7XZ5NE";
const GOOGLE_TAG_MANAGER_ID = "GTM-W979KSX3";
const GOOGLE_ANALYTICS_CONSENT_STORAGE_KEY = "overgarden:analytics-consent";
const GOOGLE_ANALYTICS_CONSENT_EVENT = "overgarden:analytics-consent-change";
export const MICROSOFT_CLARITY_ENABLED_ENV =
  "NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED";
export const MICROSOFT_CLARITY_PROJECT_ID_ENV =
  "NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID";
const MICROSOFT_CLARITY_PUBLIC_ENV = {
  [MICROSOFT_CLARITY_ENABLED_ENV]:
    process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_ENABLED,
  [MICROSOFT_CLARITY_PROJECT_ID_ENV]:
    process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID,
} satisfies Record<string, string | undefined>;
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
const MICROSOFT_CLARITY_GRANTED_CONSENT = {
  ad_Storage: "denied",
  analytics_Storage: "granted",
} as const;
const MICROSOFT_CLARITY_DENIED_CONSENT = {
  ad_Storage: "denied",
  analytics_Storage: "denied",
} as const;

type WindowClarityFn = (action: string, payload?: unknown) => void;

declare global {
  interface Window {
    clarity?: WindowClarityFn;
  }
}

export type GoogleAnalyticsConsent = "accepted" | "declined" | "undecided";

export interface MicrosoftClarityPublicConfig {
  enabled: boolean;
  projectId: string | null;
}

let initializedMicrosoftClarityProjectId: string | null = null;
let initializingMicrosoftClarityProjectId: string | null = null;

export function GoogleAnalytics({
  locale = "uk",
}: {
  locale?: InterfaceLocale;
}) {
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

  useEffect(() => {
    if (!isAllowedRoute || consent !== "accepted") {
      revokeMicrosoftClarityAnalyticsConsent();
    }
  }, [isAllowedRoute, consent]);

  const setStoredConsent = (nextConsent: GoogleAnalyticsConsent) => {
    if (nextConsent !== "undecided") {
      writeStoredGoogleAnalyticsConsent(nextConsent);
    }
    setSessionConsent(nextConsent);
  };

  if (!isAllowedRoute) return null;

  if (consent === "accepted") {
    return (
      <>
        <GoogleTagManagerScripts />
        <MicrosoftClarityAnalytics />
      </>
    );
  }
  if (consent === "declined") return null;

  return (
    <AnalyticsConsentBanner
      locale={locale}
      onAccept={() => setStoredConsent("accepted")}
      onDecline={() => setStoredConsent("declined")}
    />
  );
}

export function MicrosoftClarityAnalytics() {
  const config = resolveMicrosoftClarityPublicConfig();

  useEffect(() => {
    if (!config.enabled || !config.projectId) return;
    void initializeMicrosoftClarity(config.projectId);
  }, [config.enabled, config.projectId]);

  return null;
}

export async function initializeMicrosoftClarity(projectId: string) {
  if (typeof window === "undefined") return;

  if (initializedMicrosoftClarityProjectId === projectId) {
    grantMicrosoftClarityAnalyticsConsent();
    return;
  }

  if (initializingMicrosoftClarityProjectId === projectId) return;
  initializingMicrosoftClarityProjectId = projectId;

  try {
    const { default: Clarity } = await import("@microsoft/clarity");

    if (initializedMicrosoftClarityProjectId === projectId) {
      grantMicrosoftClarityAnalyticsConsent();
      return;
    }

    Clarity.init(projectId);
    Clarity.consentV2(MICROSOFT_CLARITY_GRANTED_CONSENT);
    initializedMicrosoftClarityProjectId = projectId;
  } finally {
    if (initializingMicrosoftClarityProjectId === projectId) {
      initializingMicrosoftClarityProjectId = null;
    }
  }
}

export function resetMicrosoftClarityForTests() {
  initializedMicrosoftClarityProjectId = null;
  initializingMicrosoftClarityProjectId = null;
}

export function GoogleTagManagerScripts() {
  return (
    <Script id="google-tag-manager" strategy="afterInteractive">
      {`
        (function(w,d,s,l,i){
          w[l]=w[l]||[];
          function gtag(){w[l].push(arguments);}
          gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'granted'
          });
          w[l].push({
            'gtm.start': new Date().getTime(),
            event: 'gtm.js',
            overgardenAnalyticsMeasurementId: '${GOOGLE_ANALYTICS_MEASUREMENT_ID}'
          });
          var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),
            dl=l!='dataLayer'?'&l='+l:'';
          j.async=true;
          j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
          f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','${GOOGLE_TAG_MANAGER_ID}');
      `}
    </Script>
  );
}

export function AnalyticsPrivacyControls() {
  const config = resolveMicrosoftClarityPublicConfig();
  const storedConsent = useSyncExternalStore(
    subscribeToGoogleAnalyticsConsent,
    readStoredGoogleAnalyticsConsent,
    getServerGoogleAnalyticsConsent,
  );
  const [sessionConsent, setSessionConsent] =
    useState<GoogleAnalyticsConsent | null>(null);
  const consent = sessionConsent ?? storedConsent;
  const statusLabel =
    consent === "accepted"
      ? "Allowed"
      : consent === "declined"
        ? "Off"
        : "Not chosen";
  const clarityStatus = config.enabled
    ? "Microsoft Clarity is enabled for this deployment after consent."
    : "Microsoft Clarity is off for this deployment.";

  const setConsent = (
    nextConsent: Exclude<GoogleAnalyticsConsent, "undecided">,
  ) => {
    writeStoredGoogleAnalyticsConsent(nextConsent);
    setSessionConsent(nextConsent);
  };

  return (
    <section className="grid gap-2 rounded-lg border border-border p-4">
      <h2 className="text-base font-semibold text-foreground">
        Public analytics
      </h2>
      <p className="text-muted-foreground">
        Status: <strong>{statusLabel}</strong>. When allowed, OverGarden may use
        Google Tag Manager / Google Analytics and Microsoft Clarity only on
        authored public, legal, and support pages. These tools do not run on
        private garden, auth, admin, invite, erasure, journal, lineage, API, or
        callback routes.
      </p>
      <p className="text-xs leading-5 text-muted-foreground">{clarityStatus}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => setConsent("accepted")}>
          Allow analytics
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
        Preference key: {GOOGLE_ANALYTICS_CONSENT_STORAGE_KEY}. Turning this off
        stops future Google Tag Manager / Google Analytics loading and revokes
        Microsoft Clarity analytics storage for the current page when Clarity is
        already initialized.
      </p>
    </section>
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
  locale,
  onAccept,
  onDecline,
}: {
  locale: InterfaceLocale;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const copy = getPublicSurfaceCopy(locale).analyticsConsent;

  return (
    <div
      aria-label={copy.label}
      data-analytics-consent-banner="true"
      className="analytics-consent-banner fixed inset-x-3 z-50 mx-auto max-w-3xl rounded-md border bg-background/95 p-4 text-foreground shadow-lg backdrop-blur sm:flex sm:items-center sm:gap-4"
      role="dialog"
    >
      <p className="text-sm leading-6 text-muted-foreground">{copy.message}</p>
      <div
        data-analytics-consent-actions="true"
        className="mt-3 grid min-w-0 gap-2 sm:mt-0 sm:flex sm:shrink-0 sm:flex-wrap"
      >
        <Button
          className="w-full min-w-0 sm:w-auto"
          onClick={onAccept}
          size="sm"
          type="button"
        >
          {copy.accept}
        </Button>
        <Button
          className="w-full min-w-0 sm:w-auto"
          onClick={onDecline}
          size="sm"
          type="button"
          variant="outline"
        >
          {copy.decline}
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

export function writeStoredGoogleAnalyticsConsent(
  consent: Exclude<GoogleAnalyticsConsent, "undecided">,
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(GOOGLE_ANALYTICS_CONSENT_STORAGE_KEY, consent);
  } catch {
    // Private browsing or storage-denied contexts must not block the UI choice.
  }
  if (consent === "accepted") {
    grantMicrosoftClarityAnalyticsConsent();
  } else {
    revokeMicrosoftClarityAnalyticsConsent();
  }
  window.dispatchEvent(new Event(GOOGLE_ANALYTICS_CONSENT_EVENT));
}

export function subscribeToGoogleAnalyticsConsent(onStoreChange: () => void) {
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

export function resolveMicrosoftClarityPublicConfig(
  env: Record<string, string | undefined> = MICROSOFT_CLARITY_PUBLIC_ENV,
): MicrosoftClarityPublicConfig {
  const enabled = isAffirmativeAnalyticsFlag(
    env[MICROSOFT_CLARITY_ENABLED_ENV],
  );
  const projectId = configuredPublicEnvValue(
    env[MICROSOFT_CLARITY_PROJECT_ID_ENV],
  );

  return {
    enabled: enabled && Boolean(projectId),
    projectId,
  };
}

function isAffirmativeAnalyticsFlag(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function configuredPublicEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return null;

  const normalized = trimmed.toLowerCase();
  if (
    normalized.includes("change_me") ||
    normalized.includes("placeholder") ||
    normalized.includes("replace_me") ||
    normalized.includes("todo") ||
    normalized.includes("...")
  ) {
    return null;
  }

  return trimmed;
}

function grantMicrosoftClarityAnalyticsConsent() {
  if (typeof window === "undefined") return;
  window.clarity?.("consentv2", MICROSOFT_CLARITY_GRANTED_CONSENT);
}

function revokeMicrosoftClarityAnalyticsConsent() {
  if (typeof window === "undefined") return;
  window.clarity?.("consentv2", MICROSOFT_CLARITY_DENIED_CONSENT);
}
