"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ANALYTICS_CONSENT_ATTRIBUTE,
  ANALYTICS_CONSENT_STORAGE_KEY,
  ANALYTICS_ROUTE_ATTRIBUTE,
  isAnalyticsRoute,
} from "@/lib/analytics-routes";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getPublicSurfaceCopy } from "@/lib/public-surface-localization";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-71LP7XZ5NE";
const GOOGLE_TAG_MANAGER_ID = "GTM-W979KSX3";
const GOOGLE_ANALYTICS_CONSENT_STORAGE_KEY = ANALYTICS_CONSENT_STORAGE_KEY;
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
  notice = "inline",
}: {
  locale?: InterfaceLocale;
  /**
   * Where the consent notice is drawn. `"inline"` — by this component, which
   * is right for a request-time document. `"document"` — by
   * `AnalyticsConsentNotice`, which a static document renders outside this
   * component's boundary (ADR-0032 D7); this component then loads the tags and
   * keeps `<html>`'s two attributes true across client-side navigations.
   */
  notice?: "inline" | "document";
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

  // The inline script answered these once, for the address the document was
  // loaded at. A client-side navigation changes the address without loading a
  // document, so from hydration on the answers are kept here.
  useEffect(() => {
    const root = document.documentElement;
    if (isAllowedRoute) root.setAttribute(ANALYTICS_ROUTE_ATTRIBUTE, "true");
    else root.removeAttribute(ANALYTICS_ROUTE_ATTRIBUTE);
    root.setAttribute(ANALYTICS_CONSENT_ATTRIBUTE, consent);
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
  if (consent === "declined" || notice === "document") return null;

  return (
    <AnalyticsConsentBanner
      locale={locale}
      onAccept={() => setStoredConsent("accepted")}
      onDecline={() => setStoredConsent("declined")}
    />
  );
}

/**
 * The consent notice of a static document (ADR-0032 D7).
 *
 * It is in the served bytes of every static document and reads neither the
 * address nor the stored answer: both are on `<html>` before first paint
 * (`analyticsDocumentBootScript`), and `globals.css` draws the notice only for
 * a measured path with no answer yet. So it paints with the page when it is
 * owed, never flashes for a reader who answered, and is never a late LCP
 * candidate — on a text page it *is* the largest thing on a phone's screen.
 */
export function AnalyticsConsentNotice({
  locale = "uk",
}: {
  locale?: InterfaceLocale;
}) {
  return (
    <AnalyticsConsentBanner
      locale={locale}
      documentNotice
      onAccept={() => writeStoredGoogleAnalyticsConsent("accepted")}
      onDecline={() => writeStoredGoogleAnalyticsConsent("declined")}
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

export function AnalyticsPrivacyControls({
  locale = "uk",
}: {
  locale?: InterfaceLocale;
}) {
  const copy = getTrustSurfaceCopy(locale).privacy.analytics;
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
      ? copy.statuses.accepted
      : consent === "declined"
        ? copy.statuses.declined
        : copy.statuses.undecided;
  const clarityStatus = config.enabled
    ? copy.clarityEnabled
    : copy.clarityDisabled;

  const setConsent = (
    nextConsent: Exclude<GoogleAnalyticsConsent, "undecided">,
  ) => {
    writeStoredGoogleAnalyticsConsent(nextConsent);
    setSessionConsent(nextConsent);
  };

  return (
    <section className="grid gap-2 rounded-lg border border-border p-4">
      <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
      <p className="text-muted-foreground">
        {copy.statusPrefix} <strong>{statusLabel}</strong>. {copy.description}
      </p>
      <p className="text-xs leading-5 text-muted-foreground">{clarityStatus}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => setConsent("accepted")}>
          {copy.allow}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setConsent("declined")}
        >
          {copy.turnOff}
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {copy.preferenceKey} {GOOGLE_ANALYTICS_CONSENT_STORAGE_KEY}.{" "}
        {copy.preferenceDescription}
      </p>
    </section>
  );
}

export function isGoogleAnalyticsRoute(pathname: string | null): boolean {
  return isAnalyticsRoute(pathname);
}

function AnalyticsConsentBanner({
  locale,
  documentNotice = false,
  onAccept,
  onDecline,
}: {
  locale: InterfaceLocale;
  /** Drawn by CSS from `<html>`'s attributes rather than by React's state. */
  documentNotice?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const copy = getPublicSurfaceCopy(locale).analyticsConsent;

  return (
    <div
      aria-label={copy.label}
      data-analytics-consent-banner="true"
      data-analytics-consent-notice={documentNotice ? "document" : undefined}
      // The system's tokens, not the palette before it: since ADR-0032 D7 this
      // element is in the bytes of every public document, and "nothing on the
      // page reaches for the old palette" is asserted against those bytes.
      className="analytics-consent-banner fixed inset-x-3 z-toast mx-auto max-w-3xl rounded-md border border-border bg-surface/95 p-4 text-text shadow-overlay backdrop-blur sm:flex sm:items-center sm:gap-4"
      role="dialog"
    >
      <p className="text-body-sm text-text-secondary">{copy.message}</p>
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
          variant="secondary"
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
  // The notice of a static document is drawn by CSS from this (ADR-0032 D7).
  window.document?.documentElement.setAttribute(
    ANALYTICS_CONSENT_ATTRIBUTE,
    consent,
  );
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
