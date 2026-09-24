"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  META_MARKETING_CONSENT_NOTICE_HEIGHT_PROPERTY,
  useNoticeHeightOnRoot,
} from "@/lib/consent-notice-room";
import type { InterfaceLocale } from "@/lib/interface-localization";
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
import { getTrustClientCopy } from "@/lib/trust-client-copy";

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

export function MetaMarketingAttribution({
  locale = "uk",
}: {
  locale?: InterfaceLocale;
}) {
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

  const setConsent = (
    nextConsent: Exclude<MetaMarketingConsent, "undecided">,
  ) => {
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
      locale={locale}
      onAccept={() => setConsent("accepted")}
      onDecline={() => setConsent("declined")}
    />
  );
}

export function MetaMarketingPrivacyControls({
  locale = "uk",
}: {
  locale?: InterfaceLocale;
}) {
  const copy = getTrustClientCopy(locale).marketing;
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
      ? copy.statuses.accepted
      : consent === "declined"
        ? copy.statuses.declined
        : copy.statuses.undecided
    : copy.statuses.deploymentOff;

  const setConsent = (
    nextConsent: Exclude<MetaMarketingConsent, "undecided">,
  ) => {
    writeStoredMetaMarketingConsent(nextConsent);
    setSessionConsent(nextConsent);
  };

  return (
    <section
      aria-labelledby="privacy-marketing-title"
      data-privacy-choice="marketing"
      className="grid gap-3 rounded-lg border border-border p-4"
    >
      <h3 id="privacy-marketing-title" className="text-h4 text-text-heading">
        {copy.title}
      </h3>
      <p aria-live="polite" className="text-body-sm text-text">
        {`${copy.statusPrefix} `}
        <strong>{statusLabel}</strong>
      </p>
      <p className="text-body-sm text-text-secondary">{copy.description}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setConsent("accepted")}
          disabled={!config.enabled}
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
            {META_MARKETING_CONSENT_STORAGE_KEY}
          </code>
          . {copy.preferenceDescription}
        </p>
      </details>
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

function MetaMarketingPublicRouteTracker({ pathname }: { pathname: string }) {
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

/**
 * The marketing question, in the analytics notice's place and shape
 * (`OVE-505`): one sentence and two answers of one weight. It is never drawn
 * while the analytics answer is still owed (`globals.css`), so a reader is
 * asked one thing at a time instead of reading two notices stacked over the
 * page. Once it is drawn, the page keeps the same room for it that it kept
 * for the analytics notice, from its own measured height.
 */
function MetaMarketingConsentBanner({
  locale,
  onAccept,
  onDecline,
}: {
  locale: InterfaceLocale;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const copy = getTrustClientCopy(locale).marketing;
  const messageId = "meta-marketing-consent-message";
  const noticeRef = useRef<HTMLElement>(null);
  useNoticeHeightOnRoot(
    noticeRef,
    META_MARKETING_CONSENT_NOTICE_HEIGHT_PROPERTY,
  );

  return (
    <section
      ref={noticeRef}
      aria-label={copy.consentLabel}
      data-meta-marketing-consent-banner="true"
      className="analytics-consent-banner fixed inset-x-3 z-header mx-auto grid max-w-3xl gap-3 rounded-lg border border-border bg-surface p-3 text-text shadow-overlay sm:flex sm:items-center sm:gap-4 sm:p-4"
    >
      <p
        id={messageId}
        className="min-w-0 flex-1 text-body-sm text-text-secondary"
      >
        {copy.consentMessage}
      </p>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:shrink-0">
        <Button
          aria-describedby={messageId}
          className="min-w-0"
          onClick={onAccept}
          size="sm"
          type="button"
          variant="secondary"
        >
          {copy.allow}
        </Button>
        <Button
          aria-describedby={messageId}
          className="min-w-0"
          onClick={onDecline}
          size="sm"
          type="button"
          variant="secondary"
        >
          {copy.keepOff}
        </Button>
      </div>
    </section>
  );
}

function stripPublicLocale(pathname: string): string {
  const stripped = pathname.replace(PUBLIC_LOCALE_PREFIX_PATTERN, "");
  return stripped || "/";
}

function getServerMetaMarketingConsent(): MetaMarketingConsent {
  return "undecided";
}
