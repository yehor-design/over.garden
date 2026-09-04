"use client";

import { Languages } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useSyncExternalStore } from "react";

import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import type { InterfaceMarket } from "@/lib/interface-market";
import {
  buildLocalizedInterfaceTarget,
  getInterfaceRoutePolicy,
  sanitizeInterfaceRouteSearch,
} from "@/lib/interface-route-policy";
import {
  BULGARIA_PUBLIC_LOCALES,
  PUBLIC_LOCALE_CONFIG,
  type PublicLocale,
} from "@/lib/public-localization";
import { cn } from "@/lib/utils";
import { setInterfaceLocaleAction } from "./locale-actions";

/**
 * Choosing an interface language.
 *
 * On a public page the language lives in the path, so the choice is a link —
 * one client navigation, and the proxy writes the preference from the prefix it
 * lands on. On a workspace route, where the address does not change, the choice
 * is a small form that writes the cookie and re-renders in place.
 *
 * It is a `<details>` disclosure rather than a popup menu on purpose. A popup
 * renders its items only once it opens, so the options are absent from the
 * server HTML and the control does nothing until the client bundle has run. A
 * disclosure ships the anchors in the document, which is what makes "choosing a
 * language is a link" true rather than merely intended. Two options do not need
 * roving focus; they need to exist.
 *
 * What this replaces (OVE-379): 1 938 lines that ran a two-phase distributed
 * commit for a language change — two flush phases with a 2 250 ms budget each,
 * two commit gates, a `POST`, then a full document replacement behind a
 * `pagehide` / `pageshow` handshake. It patched the global `fetch` so any
 * in-flight request anywhere disabled the control, and watched `input` across
 * the whole document so one keystroke in any form raised a discard dialog —
 * before a reload destroyed that text anyway. ADR-0022 D6 had already removed
 * the pattern once, as the "document-mutation admission" and the "mutation
 * registry".
 */
export interface InterfaceLanguageControlProps {
  locale: InterfaceLocale;
  market: InterfaceMarket;
  pathname?: string;
  compact?: boolean;
}

export function InterfaceLanguageControl({
  locale,
  market,
  pathname,
  compact = false,
}: InterfaceLanguageControlProps) {
  const currentPathname = usePathname() || "/";
  const activePathname = pathname ?? currentPathname;
  const browserSearch = useSyncExternalStore(
    subscribeToBrowserLocation,
    readBrowserSearch,
    emptyBrowserSearch,
  );
  const copy = getInterfaceCopy(locale).shell;
  const localizedRoute =
    getInterfaceRoutePolicy(activePathname).mode === "localized-link";

  if (
    market !== "bulgaria" ||
    !BULGARIA_PUBLIC_LOCALES.includes(
      locale as (typeof BULGARIA_PUBLIC_LOCALES)[number],
    )
  ) {
    return null;
  }

  return (
    <nav
      data-interface-language-control="site-shell-interface-language-control"
      aria-label={copy.languageControlLabel}
      className={cn("relative min-w-0 text-foreground", compact && "text-right")}
    >
      <details className="group/language relative">
        <summary
          aria-label={copy.languageControlTrigger}
          data-interface-language-trigger="true"
          className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-8 sm:py-1"
        >
          <Languages className="size-4" aria-hidden="true" />
          <span className={compact ? "" : "sr-only"}>
            {PUBLIC_LOCALE_CONFIG[locale].shortLabel}
          </span>
        </summary>
        <div
          role="menu"
          data-interface-language-menu
          className="absolute top-full right-0 z-30 mt-1 grid min-w-44 gap-1 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {BULGARIA_PUBLIC_LOCALES.map((availableLocale) => {
            const config = PUBLIC_LOCALE_CONFIG[availableLocale];
            const selected = availableLocale === locale;
            const target = buildLocalizedInterfaceTarget({
              locale: availableLocale,
              pathname: activePathname,
              search: browserSearch,
            });

            if (localizedRoute && target) {
              return (
                <Link
                  key={availableLocale}
                  href={target}
                  role="menuitemradio"
                  aria-checked={selected}
                  aria-current={selected ? "true" : undefined}
                  hrefLang={config.htmlLang}
                  lang={config.htmlLang}
                  data-interface-language-option
                  data-interface-locale={availableLocale}
                  className={optionClassName(selected)}
                >
                  {config.label}
                </Link>
              );
            }

            return (
              <LocalePreferenceOption
                key={availableLocale}
                locale={availableLocale}
                htmlLang={config.htmlLang}
                label={config.label}
                selected={selected}
              />
            );
          })}
        </div>
      </details>
    </nav>
  );
}

/**
 * The workspace variant: the address stays put, so the preference is written
 * and the page re-renders in place. No document replacement — which is why text
 * typed into a composer survives a language change now. The old design destroyed
 * it every time, having first asked the gardener to confirm the loss.
 */
function LocalePreferenceOption({
  locale,
  htmlLang,
  label,
  selected,
}: {
  locale: PublicLocale;
  htmlLang: string;
  label: string;
  selected: boolean;
}) {
  const [, formAction] = useActionState(setInterfaceLocaleAction, null);

  // `formAction` goes straight in. Wrapping it to add a `router.refresh()`
  // afterwards would replace the form's real endpoint with React's
  // `javascript:` placeholder, and the control would need hydration to do
  // anything — the exact defect OVE-377 shipped once. The refresh is not needed
  // anyway: Next re-renders the current route after every Server Action, and
  // workspace routes are `no-store`, so the new language is what comes back.
  return (
    <form action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        lang={htmlLang}
        role="menuitemradio"
        aria-checked={selected}
        aria-current={selected ? "true" : undefined}
        data-interface-language-option
        data-interface-locale={locale}
        className={cn(optionClassName(selected), "w-full")}
      >
        {label}
      </button>
    </form>
  );
}

function optionClassName(selected: boolean) {
  return cn(
    "flex min-h-11 items-center rounded-sm px-3 py-2 text-left text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-8 sm:py-1",
    selected && "font-semibold",
  );
}

/** Compatibility alias for existing imports while the canonical owner is named. */
export const LanguageSwitcher = InterfaceLanguageControl;

export function languageHref({
  locale,
  pathname,
  search,
}: {
  locale: PublicLocale;
  pathname: string;
  search: string;
}) {
  const localizedTarget = buildLocalizedInterfaceTarget({
    locale,
    pathname,
    search,
  });
  if (localizedTarget) return localizedTarget;

  return `${pathname}${sanitizeInterfaceRouteSearch(pathname, search)}`;
}

function subscribeToBrowserLocation(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

function readBrowserSearch() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function emptyBrowserSearch() {
  return "";
}
