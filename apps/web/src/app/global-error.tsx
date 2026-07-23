"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { InterfaceLanguageControl } from "@/components/public/language-switcher";
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
import {
  GOOGLE_SANS_FONT_FACE_CSS,
  GOOGLE_SANS_STACK,
} from "@/lib/typography/google-sans-runtime";
import { GoogleSansPreloads } from "@/lib/typography/google-sans-preloads";

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

const GLOBAL_ERROR_TYPOGRAPHY_CSS = `${GOOGLE_SANS_FONT_FACE_CSS}
:root {
  --font-overgarden-sans: ${GOOGLE_SANS_STACK};
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
    <html lang={interfaceContext.locale} suppressHydrationWarning>
      <head>
        <meta name="referrer" content="no-referrer" />
        <GoogleSansPreloads />
        <style
          dangerouslySetInnerHTML={{ __html: GLOBAL_ERROR_TYPOGRAPHY_CSS }}
        />
      </head>
      <body className="flex min-h-dvh flex-col bg-background text-foreground">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-foreground/15 bg-foreground px-3 text-background sm:px-5">
          <a
            href={localizedPath(interfaceContext.locale, "/")}
            className="inline-flex min-h-14 items-center bg-primary px-4 font-semibold text-primary-foreground"
          >
            OverGarden
          </a>
          {interfaceContext.market === "bulgaria" ? (
            <div className="rounded-md bg-background text-foreground">
              <InterfaceLanguageControl
                locale={interfaceContext.locale}
                market={interfaceContext.market}
                compact
              />
            </div>
          ) : null}
        </header>
        <main
          data-global-error="true"
          className="mx-auto grid w-full max-w-3xl flex-1 content-center gap-5 px-5 py-12"
        >
          <p className="text-sm font-semibold text-primary uppercase">
            {copy.shell.errorEyebrow}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {copy.shell.errorTitle}
          </h1>
          <p className="max-w-2xl leading-7 text-muted-foreground">
            {copy.shell.errorDescription}
          </p>
          <div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {copy.shell.retry}
            </button>
          </div>
        </main>
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
  if (key === "bulgaria:bg") return { market: "bulgaria", locale: "bg" };
  if (key === "bulgaria:ru") return { market: "bulgaria", locale: "ru" };
  return SAFE_GLOBAL_ERROR_CONTEXT;
}

export function resolveGlobalErrorInterfaceContext(input: {
  pathname: string;
  htmlLang: string | null | undefined;
  metadataHint?: string | null;
}): GlobalErrorInterfaceContext {
  const routeLocale = stripLocalePrefix(input.pathname).locale;
  if (routeLocale === "bg" || routeLocale === "ru") {
    return { market: "bulgaria", locale: routeLocale };
  }
  if (routeLocale === "uk") return SAFE_GLOBAL_ERROR_CONTEXT;

  const metadataContext = parseInterfaceLocalizationHint(input.metadataHint);
  if (metadataContext) return metadataContext;

  const documentLocale = normalizeInterfaceLocale(input.htmlLang);
  if (documentLocale === "bg" || documentLocale === "ru") {
    return { market: "bulgaria", locale: documentLocale };
  }

  return SAFE_GLOBAL_ERROR_CONTEXT;
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
