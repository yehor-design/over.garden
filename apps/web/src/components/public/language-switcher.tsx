"use client";

import { TranslateIcon as Languages } from "@/components/icons/Translate";
import { usePathname } from "next/navigation";
import { useActionState, useSyncExternalStore } from "react";

import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import type { InterfaceMarket } from "@/lib/interface-market";
import {
  buildInterfaceLocaleChoiceTarget,
  sanitizeInterfaceRouteSearch,
} from "@/lib/interface-route-policy";
import {
  INTERFACE_LOCALE_CHOICES,
  PUBLIC_LOCALE_CONFIG,
  type PublicLocale,
} from "@/lib/public-localization";
import { cn } from "@/lib/utils";
import { setInterfaceLocaleAction } from "./locale-actions";
import { HiddenField } from "@/components/ui/hidden-field";

/**
 * Choosing an interface language.
 *
 * On a public page the language lives in the path, so the choice is a link —
 * one document navigation, and the proxy writes the preference from the prefix
 * it lands on (on a document load and nothing else: a prefix the router merely
 * fetched is not a choice). On a workspace route, where the address does not
 * change, the choice is a small form that writes the cookie and re-renders in
 * place.
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
  market?: InterfaceMarket;
  /**
   * The address the options are built from. Omitted, the control reads it
   * itself — right for a request-time surface such as the error page. `null`
   * says "not known yet": the fallback shell of a route with a dynamic segment
   * (ADR-0032 D3), where the options lead to each language's home until the
   * address arrives a moment later.
   */
  pathname?: string | null;
  compact?: boolean;
}

export function InterfaceLanguageControl(props: InterfaceLanguageControlProps) {
  return props.pathname === undefined ? (
    <CurrentPathLanguageControl {...props} />
  ) : (
    <LanguageControlView {...props} pathname={props.pathname ?? "/"} />
  );
}

function CurrentPathLanguageControl(
  props: Omit<InterfaceLanguageControlProps, "pathname">,
) {
  return <LanguageControlView {...props} pathname={usePathname() || "/"} />;
}

function LanguageControlView({
  locale,
  market,
  pathname: activePathname,
  compact = false,
}: Omit<InterfaceLanguageControlProps, "pathname"> & { pathname: string }) {
  const browserSearch = useSyncExternalStore(
    subscribeToBrowserLocation,
    readBrowserSearch,
    emptyBrowserSearch,
  );
  const copy = getInterfaceCopy(locale).shell;

  // Every reader sees every language (owner decision, 2026-09-17). The control
  // used to render only for the Bulgarian market, so a reader in Ukraine had no
  // way to change the interface at all and a reader in Bulgaria lost the
  // control the moment they chose Ukrainian.
  return (
    <nav
      data-interface-language-control="site-shell-interface-language-control"
      data-interface-market={market}
      aria-label={copy.languageControlLabel}
      className={cn("relative min-w-0 text-text", compact && "text-right")}
    >
      <details className="group/language relative">
        <summary
          aria-label={copy.languageControlTrigger}
          data-interface-language-trigger="true"
          className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-body-sm font-medium outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:min-h-8 sm:py-1"
        >
          <Languages className="size-4" aria-hidden="true" />
          <span className={compact ? "" : "sr-only"}>
            {PUBLIC_LOCALE_CONFIG[locale].shortLabel}
          </span>
        </summary>
        <div
          role="menu"
          data-interface-language-menu
          className="absolute top-full right-0 z-popover mt-1 grid min-w-44 gap-1 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {INTERFACE_LOCALE_CHOICES.map((availableLocale) => {
            const config = PUBLIC_LOCALE_CONFIG[availableLocale];
            const selected = availableLocale === locale;
            const target = buildInterfaceLocaleChoiceTarget({
              locale: availableLocale,
              pathname: activePathname,
              search: browserSearch,
            });

            if (target) {
              return (
                // A plain anchor, not `next/link`. The prefix in the target is
                // what tells the proxy this language was *chosen*: it resolves
                // the interface locale from the route, writes the preference,
                // and folds the address back to its canonical spelling. A
                // client-side navigation would reach the prefixed route without
                // that fold and leave the reader on a second spelling of the
                // page they are already on.
                //
                // It is not prefetched for the same reason it never was: Next
                // strips `Next-Router-Prefetch` before the proxy runs (verified
                // in Chromium against a production build, 2026-09-04), so a
                // prefetch would be indistinguishable from a choice and merely
                // hovering an option would rewrite the saved language.
                <a
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
                </a>
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
  // anyway: Next re-renders the current route after an action that writes a
  // cookie, and hands that render the cookies the action wrote. The new
  // language comes back only because the render reads it from the cookie: a
  // language the proxy pinned on the request's headers before the choice used
  // to outrank it, and the page came back in the language just left
  // (`forwardInterfaceLocalization` in `proxy.ts`).
  return (
    <form action={formAction}>
      <HiddenField name="locale" value={locale} />
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
    "flex min-h-11 items-center rounded-sm px-3 py-2 text-left text-body-sm outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring sm:min-h-8 sm:py-1",
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
  const choiceTarget = buildInterfaceLocaleChoiceTarget({
    locale,
    pathname,
    search,
  });
  if (choiceTarget) return choiceTarget;

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
