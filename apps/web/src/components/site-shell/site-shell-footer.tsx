import Link from "next/link";

import { InterfaceLanguageControl } from "@/components/public/language-switcher";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { InterfaceMarket } from "@/lib/interface-market";
import type { SiteShellFooterLink } from "@/lib/site-shell-navigation";

/**
 * The footer, and the `contentinfo` landmark the product did not have at all.
 *
 * `/privacy`, `/support` and `/first-publication-disclosure` were reachable
 * from nowhere: three pages that exist, answer, and were linked by nothing.
 *
 * It is also the one home of the language control (DESIGN.md §6: exactly one
 * per rendered document). It sat in the header before, which put a language
 * menu beside the product's navigation on every screen; the footer is where
 * every product that has three languages and a rail puts it.
 *
 * **No `thiings.co` credit.** `DESIGN.md` §2.9 records the owner's position of
 * 2026-09-17 — the free tier and no attribution anywhere, including here. An
 * earlier draft of ADR-0031 D10 required the credit and was wrong about what
 * had been decided. The data-source attributions below are a different thing
 * and stay: they are what the catalogue is built from.
 */
export function SiteShellFooter({
  locale,
  market,
  pathname,
  links,
  navigationLabel,
  tagline,
  sourcesTitle,
  sourcesDescription,
}: {
  locale: InterfaceLocale;
  market?: InterfaceMarket;
  pathname: string | null;
  links: readonly SiteShellFooterLink[];
  navigationLabel: string;
  tagline: string;
  sourcesTitle: string;
  sourcesDescription: string;
}) {
  return (
    <footer
      data-site-shell-region="footer"
      className="mt-12 border-t border-border px-4 py-8 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-content flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-sm text-body-sm text-text-secondary">{tagline}</p>
          <div className="shrink-0">
            <InterfaceLanguageControl
              locale={locale}
              market={market}
              pathname={pathname}
              compact
            />
          </div>
        </div>

        <nav aria-label={navigationLabel}>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {links.map((link) => (
              <li key={link.key}>
                <Link
                  href={link.href}
                  data-site-shell-footer-link={link.key}
                  className="inline-flex min-h-11 items-center rounded-sm text-body-sm text-text-secondary underline-offset-4 outline-none hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div
          data-site-shell-footer-sources="true"
          className="flex flex-col gap-1 border-t border-border pt-5"
        >
          <p className="text-overline text-text-muted uppercase">
            {sourcesTitle}
          </p>
          <p className="text-caption text-text-muted">{sourcesDescription}</p>
        </div>
      </div>
    </footer>
  );
}
