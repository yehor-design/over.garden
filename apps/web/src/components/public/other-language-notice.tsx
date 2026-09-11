import Link from "next/link";

import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  buildLocalizedInterfaceTarget,
  getInterfaceRoutePolicy,
} from "@/lib/interface-route-policy";
import {
  DEFAULT_PUBLIC_LOCALE,
  PUBLIC_LOCALE_CONFIG,
  isPublicLocale,
  stripLocalePrefix,
} from "@/lib/public-localization";

/**
 * What replaced the geo-redirect (ADR-0029 D10).
 *
 * A canonical URL answers 200 to everyone, so a reader can land on an address
 * whose language is not theirs. This says so and offers the one that is, as a
 * link — the address is the language, so choosing one is a navigation.
 *
 * It renders in the server HTML and needs no hydration (ADR-0024): the shell
 * that holds it is server-rendered, and this is an anchor, not a control. It is
 * absent whenever the reader's language already matches the address, which is
 * every request from the Ukraine market and every already-prefixed request.
 *
 * Never prefetched: the proxy reads the saved language from the prefix a
 * request lands on, and Next strips `Next-Router-Prefetch` before middleware
 * runs, so a prefetch would be indistinguishable from a navigation and merely
 * hovering this would rewrite the reader's language (ADR-0024 D4).
 */
export function OtherLanguageNotice({
  locale,
  pathname,
}: {
  locale: InterfaceLocale;
  pathname: string;
}) {
  const routeLocale = stripLocalePrefix(pathname).locale ?? DEFAULT_PUBLIC_LOCALE;
  if (!isPublicLocale(locale) || locale === routeLocale) return null;
  if (getInterfaceRoutePolicy(pathname).mode !== "localized-link") return null;

  const target = buildLocalizedInterfaceTarget({ locale, pathname });
  if (!target) return null;

  const copy = getInterfaceCopy(locale).shell;
  const config = PUBLIC_LOCALE_CONFIG[locale];

  return (
    <div
      data-other-language-notice="true"
      className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
    >
      <Link
        href={target}
        prefetch={false}
        hrefLang={config.htmlLang}
        lang={config.htmlLang}
        data-other-language-target={locale}
        className="font-medium underline underline-offset-4 hover:no-underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {copy.otherLanguageAvailable} — {config.label}
      </Link>
    </div>
  );
}
