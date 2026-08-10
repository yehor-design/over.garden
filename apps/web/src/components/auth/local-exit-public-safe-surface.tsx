import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  getLanguageSwitcherLocales,
  PUBLIC_LOCALE_CONFIG,
} from "@/lib/public-localization";
import { localizedPublicRoot } from "@/lib/auth/sign-out-contract";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

export function LocalExitPublicSafeSurface({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const interfaceCopy = getInterfaceCopy(locale);
  const trustCopy = getTrustSurfaceCopy(locale);

  return (
    <main
      data-local-exit-public-safe="true"
      className="mx-auto grid min-h-40 w-full max-w-xl content-center gap-4 px-4 py-8"
    >
      <a
        className="font-medium underline underline-offset-4"
        href={localizedPublicRoot(locale)}
      >
        {trustCopy.authIntent.returnToReading}
      </a>
      <nav
        aria-label={interfaceCopy.shell.languageControlLabel}
        className="flex flex-wrap gap-3 text-sm"
      >
        {getLanguageSwitcherLocales(locale).map((targetLocale) => (
          <a
            key={targetLocale}
            href={localizedPublicRoot(targetLocale)}
            hrefLang={targetLocale}
            lang={PUBLIC_LOCALE_CONFIG[targetLocale].htmlLang}
            className="underline underline-offset-4"
          >
            {PUBLIC_LOCALE_CONFIG[targetLocale].label}
          </a>
        ))}
      </nav>
    </main>
  );
}
