import Link from "next/link";

import {
  localizedPath,
  PUBLIC_LOCALE_CONFIG,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";

export function LanguageSwitcher({
  locale,
  basePath,
  availableLocales = PUBLIC_LOCALES,
}: {
  locale: PublicLocale;
  basePath: string;
  availableLocales?: readonly PublicLocale[];
}) {
  return (
    <nav
      aria-label="Language switcher"
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      {availableLocales.map((availableLocale) => {
        const config = PUBLIC_LOCALE_CONFIG[availableLocale];
        const isCurrent = availableLocale === locale;

        return (
          <Link
            key={availableLocale}
            href={localizedPath(availableLocale, basePath)}
            hrefLang={config.htmlLang}
            aria-current={isCurrent ? "page" : undefined}
            className={`rounded-md border px-2 py-1 transition-colors ${
              isCurrent
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {config.label}
          </Link>
        );
      })}
    </nav>
  );
}
