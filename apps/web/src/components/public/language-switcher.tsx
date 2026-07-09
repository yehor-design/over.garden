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
  if (availableLocales.length < 2) {
    return null;
  }

  return (
    <nav
      aria-label="Language switcher"
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      {availableLocales.map((availableLocale) => {
        const config = PUBLIC_LOCALE_CONFIG[availableLocale];
        const isCurrent = availableLocale === locale;

        return (
          // A locale change must reload the root document so html lang and
          // request-persisted preference change atomically.
          <a
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
          </a>
        );
      })}
    </nav>
  );
}
