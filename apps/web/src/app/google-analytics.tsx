"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ANALYTICS_CONSENT_ATTRIBUTE,
  ANALYTICS_CONSENT_STORAGE_KEY,
  isAnalyticsRoute,
} from "@/lib/analytics-routes";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { localizedPath } from "@/lib/public-localization";
import { Link } from "@/components/ui/link";
import {
  ANALYTICS_CONSENT_NOTICE_HEIGHT_PROPERTY,
  useNoticeHeightOnRoot,
} from "@/lib/consent-notice-room";
import { getTrustClientCopy } from "@/lib/trust-client-copy";

export { ANALYTICS_CONSENT_NOTICE_HEIGHT_PROPERTY };

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

/**
 * The measurement tags, on the measured paths, once the reader has accepted.
 *
 * It draws nothing a reader sees: the notice is `AnalyticsConsentNotice`,
 * which every document renders outside this component (ADR-0032 D7). A reader
 * who accepts on a path that is not measured has answered for the whole site;
 * the tags start on the first measured path they open.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const consent = useSyncExternalStore(
    subscribeToGoogleAnalyticsConsent,
    readStoredGoogleAnalyticsConsent,
    getServerGoogleAnalyticsConsent,
  );
  const isAllowedRoute = isGoogleAnalyticsRoute(pathname);

  useEffect(() => {
    if (!isAllowedRoute || consent !== "accepted") {
      revokeMicrosoftClarityAnalyticsConsent();
    }
  }, [isAllowedRoute, consent]);

  // The notice is drawn from `<html>`'s attribute, and an answer given in
  // another tab reaches this one only as a `storage` event — so the answer is
  // carried there. Only an answer: "undecided" is what the inline script
  // already wrote, and a hydrating render starts from the server's
  // "undecided", which must not draw the notice for a reader who answered.
  useEffect(() => {
    if (consent === "undecided") return;
    document.documentElement.setAttribute(ANALYTICS_CONSENT_ATTRIBUTE, consent);
  }, [consent]);

  if (!isAllowedRoute || consent !== "accepted") return null;

  return (
    <>
      <GoogleTagManagerScripts />
      <MicrosoftClarityAnalytics />
    </>
  );
}

/**
 * The consent notice, owed on every page until the reader answers
 * (ADR-0032 D7; the owner, 2026-09-21).
 *
 * It is in the served bytes of every document and reads neither the address
 * nor the stored answer: the answer is on `<html>` before first paint
 * (`analyticsDocumentBootScript`), and `globals.css` draws the notice while
 * there is none. So it paints with the page when it is owed, stays through
 * every client-side navigation, never flashes for a reader who answered, and
 * is never a late LCP candidate — on a text page it *is* the largest thing on
 * a phone's screen.
 *
 * What it asks is one question and two equal answers (`OVE-505`). It used to
 * be a paragraph naming routes and callbacks, with "accept" drawn as the
 * product's primary button and "decline" as the lesser one; then two
 * sentences that took 42% of a 320 px screen with the tab bar. It names who
 * measures and which pages — only the tools this deployment runs, so
 * Microsoft only where Clarity is configured — and the rest is one link away,
 * on the privacy page. It is a named region, not a dialog: it takes no focus
 * and holds none, and a non-modal "dialog" on every page also answered every
 * test that looked for the page's real one.
 *
 * While it is owed, the page keeps clear of it (`globals.css`, "The bottom of
 * the screen"): a control a keyboard reaches is scrolled above it, never left
 * beneath it (WCAG 2.4.11), a row that sticks to the bottom sits on top of it,
 * and the last row of a page can be scrolled past it. How much room that is
 * is this element's own height, which it measures and writes on `<html>`.
 */
export function AnalyticsConsentNotice({
  locale = "uk",
  clarityEnabled = resolveMicrosoftClarityPublicConfig().enabled,
}: {
  locale?: InterfaceLocale;
  /** Whether this deployment runs Microsoft Clarity after consent. */
  clarityEnabled?: boolean;
}) {
  const copy = getTrustClientCopy(locale).analyticsConsent;
  const messageId = "analytics-consent-message";
  const noticeRef = useRef<HTMLElement>(null);
  useNoticeHeightOnRoot(noticeRef, ANALYTICS_CONSENT_NOTICE_HEIGHT_PROPERTY);

  return (
    <>
      <div aria-hidden="true" data-analytics-consent-spacer="true" />
      <section
        ref={noticeRef}
        aria-label={copy.label}
        data-analytics-consent-banner="true"
        // The system's tokens, not the palette before it: since ADR-0032 D7
        // this element is in the bytes of every public document, and "nothing
        // on the page reaches for the old palette" is asserted against those
        // bytes.
        //
        // Chrome, not a toast: `z-header`, above the page and the tab bar and
        // beneath everything a reader opens. At `z-toast` it covered the
        // language menu's options on the workspace — and would have covered
        // every menu, sheet and dialog that reaches the bottom of the screen
        // (DESIGN.md §2.11).
        className="analytics-consent-banner fixed inset-x-3 z-header mx-auto grid max-w-3xl gap-3 rounded-lg border border-border bg-surface p-3 text-text shadow-overlay sm:flex sm:items-center sm:gap-4 sm:p-4"
      >
        <p
          id={messageId}
          className="min-w-0 flex-1 text-body-sm text-text-secondary"
        >
          {clarityEnabled ? copy.messageWithClarity : copy.message}{" "}
          <Link
            href={`${localizedPath(locale, "/privacy")}#privacy-choices`}
            // A prefixed address from an unprefixed page: the proxy cannot
            // see a prefetch, so it is not made (ADR-0029 D10).
            prefetch={false}
            className="whitespace-nowrap"
          >
            {copy.details}
          </Link>
        </p>
        <div
          data-analytics-consent-actions="true"
          // Two answers of one weight, side by side at every width: neither
          // is the product's primary action, and declining is not a second
          // look (`OVE-505`, criterion 2).
          className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:shrink-0"
        >
          <Button
            aria-describedby={messageId}
            className="min-w-0"
            data-analytics-consent-answer="accepted"
            onClick={() => writeStoredGoogleAnalyticsConsent("accepted")}
            size="sm"
            type="button"
            variant="secondary"
          >
            {copy.accept}
          </Button>
          <Button
            aria-describedby={messageId}
            className="min-w-0"
            data-analytics-consent-answer="declined"
            onClick={() => writeStoredGoogleAnalyticsConsent("declined")}
            size="sm"
            type="button"
            variant="secondary"
          >
            {copy.decline}
          </Button>
        </div>
      </section>
    </>
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
  const copy = getTrustClientCopy(locale).analytics;
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

  // A section of the privacy page's "your choice", in the system's type and
  // colours (`OVE-505`): the answer is said in words and announced when it
  // changes, both answers weigh the same, and where the choice is kept is a
  // detail for whoever asks, not the page's second paragraph.
  return (
    <section
      aria-labelledby="privacy-analytics-title"
      data-privacy-choice="analytics"
      className="grid gap-3 rounded-lg border border-border p-4"
    >
      <h3 id="privacy-analytics-title" className="text-h4 text-text-heading">
        {copy.title}
      </h3>
      <p aria-live="polite" className="text-body-sm text-text">
        {`${copy.statusPrefix} `}
        <strong data-privacy-choice-status={consent}>{statusLabel}</strong>
      </p>
      <p className="text-body-sm text-text-secondary">{copy.description}</p>
      <p className="text-caption text-text-muted">{clarityStatus}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setConsent("accepted")}
        >
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
      <details className="text-caption text-text-muted">
        <summary className="w-fit cursor-pointer rounded-sm text-text-secondary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          {copy.technicalSummary}
        </summary>
        <p className="mt-2">
          {`${copy.preferenceKey} `}
          <code className="font-mono">
            {GOOGLE_ANALYTICS_CONSENT_STORAGE_KEY}
          </code>
          . {copy.preferenceDescription}
        </p>
      </details>
    </section>
  );
}

export function isGoogleAnalyticsRoute(pathname: string | null): boolean {
  return isAnalyticsRoute(pathname);
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
  // The notice is drawn by CSS from this, on every page (ADR-0032 D7).
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
