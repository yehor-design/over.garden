"use client";

import "@/app/globals.css";

import { useEffect, useState, useSyncExternalStore } from "react";

import { InterfaceLanguageControl } from "@/components/public/language-switcher";
import { OverGardenLogo } from "@/components/site-shell/over-garden-logo";
import {
  getInterfaceCopy,
  INTERFACE_CONTEXT_META_NAME,
  normalizeInterfaceLocale,
  parseInterfaceLocalizationHint,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  isInterfaceLocaleAllowed,
  type InterfaceMarket,
} from "@/lib/interface-market";
import { INTERFACE_CONTEXT_ENDPOINT } from "@/lib/interface-route-policy";
import { localizedPath, stripLocalePrefix } from "@/lib/public-localization";
import { getTrustClientCopy } from "@/lib/trust-client-copy";
import { googleSans } from "./fonts";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset(): void;
}

interface GlobalErrorInterfaceContext {
  market: InterfaceMarket;
  locale: InterfaceLocale;
}

const SAFE_GLOBAL_ERROR_CONTEXT: GlobalErrorInterfaceContext = {
  market: "ukraine",
  locale: "uk",
};

const GLOBAL_ERROR_TYPOGRAPHY_CSS = `
:root {
  --font-overgarden-sans: var(--font-google-sans), Arial, sans-serif;
  font-family: var(--font-overgarden-sans);
  font-optical-sizing: auto;
  font-synthesis: none;
}
button, input, select, textarea { font: inherit; }
`;

export default function GlobalError({ reset }: GlobalErrorProps) {
  const documentContextKey = useSyncExternalStore(
    subscribeGlobalErrorDocumentContext,
    readGlobalErrorDocumentContextKey,
    readSafeGlobalErrorContextKey,
  );
  const [remoteContext, setRemoteContext] =
    useState<GlobalErrorInterfaceContext | null>(null);
  const interfaceContext =
    remoteContext ?? parseGlobalErrorContextKey(documentContextKey);
  const copy = getInterfaceCopy(interfaceContext.locale);
  const choicesCopy = getTrustClientCopy(interfaceContext.locale);

  useEffect(() => {
    let active = true;
    void fetch(INTERFACE_CONTEXT_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      referrerPolicy: "no-referrer",
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return normalizeGlobalErrorContext(await response.json());
      })
      .then((context) => {
        if (active && context) setRemoteContext(context);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = interfaceContext.locale;
  }, [interfaceContext.locale]);

  return (
    <html
      lang={interfaceContext.locale}
      className={googleSans.variable}
      suppressHydrationWarning
    >
      <head>
        <meta name="referrer" content="no-referrer" />
        <style
          dangerouslySetInnerHTML={{ __html: GLOBAL_ERROR_TYPOGRAPHY_CSS }}
        />
      </head>
      {/* Drawn as the shell is (DESIGN.md §3.2, `OVE-478`): the logo on a
          light header, the page's one heading, the retry as the primary
          action, and the language control in the footer. It used to be the
          pre-redesign chrome — a dark bar with a brand block — and it read
          none of the shell's styles: this document replaces the root
          layout, so it imports `globals.css` itself, as Next requires. */}
      <body className="flex min-h-dvh flex-col bg-surface text-text">
        <header className="flex min-h-14 items-center border-b border-border bg-surface px-2 sm:px-4">
          <a
            href={localizedPath(interfaceContext.locale, "/")}
            className="flex min-h-11 items-center rounded-md px-2 py-1 text-action outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <OverGardenLogo className="h-7 w-auto shrink-0" />
            <span className="sr-only">OverGarden</span>
          </a>
        </header>
        <main
          data-global-error="true"
          className="mx-auto grid w-full max-w-content flex-1 content-center gap-4 px-5 py-12"
        >
          <p className="text-overline text-text-muted uppercase">
            {copy.shell.errorEyebrow}
          </p>
          <h1 className="text-h1 text-balance text-text-heading">
            {copy.shell.errorTitle}
          </h1>
          <p className="max-w-prose text-body text-text-muted">
            {copy.shell.errorDescription}
          </p>
          <div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-action px-4 py-2 text-body-sm font-medium text-text-on-fill hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {copy.shell.retry}
            </button>
          </div>
          <nav
            aria-label={choicesCopy.supportTitle}
            className="flex flex-wrap gap-x-5 gap-y-1"
          >
            {/* A root failure must recover through a new document, independently of the failed router. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/support"
              className="inline-flex min-h-11 items-center text-body-sm text-text-secondary underline underline-offset-4 hover:text-text"
            >
              {choicesCopy.supportTitle}
            </a>
            <a
              href={localizedPath(interfaceContext.locale, "/privacy")}
              className="inline-flex min-h-11 items-center text-body-sm text-text-secondary underline underline-offset-4 hover:text-text"
            >
              {choicesCopy.privacyTitle}
            </a>
          </nav>
        </main>
        {/* Exactly one control, in either market, and in the footer where
            the shell keeps it (DESIGN.md §6). It used to render only for
            Bulgaria, which left a reader whose market resolved to Ukraine
            with no way to change the language on the one page they most
            need to understand. */}
        <footer className="border-t border-border px-5 py-6">
          <InterfaceLanguageControl
            locale={interfaceContext.locale}
            market={interfaceContext.market}
            compact
          />
        </footer>
      </body>
    </html>
  );
}

function subscribeGlobalErrorDocumentContext() {
  return () => undefined;
}

function readSafeGlobalErrorContextKey() {
  return "ukraine:uk";
}

function readGlobalErrorDocumentContextKey() {
  const context = resolveGlobalErrorInterfaceContext({
    pathname: new URL(document.URL).pathname,
    htmlLang: document.documentElement.lang,
    metadataHint: document.head
      .querySelector<HTMLMetaElement>(
        `meta[name="${INTERFACE_CONTEXT_META_NAME}"]`,
      )
      ?.getAttribute("content"),
  });
  return `${context.market}:${context.locale}`;
}

function parseGlobalErrorContextKey(key: string): GlobalErrorInterfaceContext {
  // Through the shared parser rather than a list of the two pairs the old
  // model allowed: `bulgaria:uk` and `ukraine:ru` are ordinary readers now,
  // and a hand-written allow-list silently reset them to Ukrainian.
  return parseInterfaceLocalizationHint(key) ?? SAFE_GLOBAL_ERROR_CONTEXT;
}

/**
 * What this document still knows about the reader after everything else has
 * failed, in two independent halves.
 *
 * **The market is never read out of a language.** That is the one rule the
 * previous model broke — `/bg/**` meant "the Bulgaria market", `/uk/**` meant
 * "the Ukraine market" — and it is how a reader in Bulgaria who chose
 * Ukrainian lost the control that had got them there. The market comes from
 * the hint the document carries, or it fails to the default
 * (`docs/INTERFACE_LOCALE_CONTRACT.md`, rule 3).
 *
 * **The locale is the most specific thing still legible**: the address the
 * reader was on, then the hint, then the document's own `lang`. It decides
 * only which language this page speaks, and every market speaks all three.
 */
export function resolveGlobalErrorInterfaceContext(input: {
  pathname: string;
  htmlLang: string | null | undefined;
  metadataHint?: string | null;
}): GlobalErrorInterfaceContext {
  const metadataContext = parseInterfaceLocalizationHint(input.metadataHint);
  const locale =
    stripLocalePrefix(input.pathname).locale ??
    metadataContext?.locale ??
    normalizeInterfaceLocale(input.htmlLang) ??
    SAFE_GLOBAL_ERROR_CONTEXT.locale;

  return {
    market: metadataContext?.market ?? SAFE_GLOBAL_ERROR_CONTEXT.market,
    locale,
  };
}

function normalizeGlobalErrorContext(
  value: unknown,
): GlobalErrorInterfaceContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const market =
    record.market === "ukraine" || record.market === "bulgaria"
      ? record.market
      : null;
  const locale =
    typeof record.locale === "string"
      ? normalizeInterfaceLocale(record.locale)
      : null;
  if (!market || !locale || !isInterfaceLocaleAllowed(market, locale)) {
    return null;
  }

  return { market, locale };
}
