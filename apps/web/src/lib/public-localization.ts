export const PUBLIC_LOCALES = ["uk", "bg", "ru"] as const;

export type PublicLocale = (typeof PUBLIC_LOCALES)[number];

export const DEFAULT_PUBLIC_LOCALE: PublicLocale = "uk";
export const UKRAINE_PUBLIC_LOCALES = [
  "uk",
] as const satisfies readonly PublicLocale[];
export const BULGARIA_PUBLIC_LOCALES = [
  "bg",
  "ru",
] as const satisfies readonly PublicLocale[];
export const PREFIXED_PUBLIC_LOCALES = [
  "bg",
  "ru",
] as const satisfies readonly PublicLocale[];

export const PUBLIC_LOCALE_CONFIG: Record<
  PublicLocale,
  {
    label: string;
    shortLabel: string;
    htmlLang: string;
  }
> = {
  uk: {
    label: "Українська",
    shortLabel: "UK",
    htmlLang: "uk",
  },
  bg: {
    label: "Български",
    shortLabel: "BG",
    htmlLang: "bg",
  },
  ru: {
    label: "Русский",
    shortLabel: "RU",
    htmlLang: "ru",
  },
};

export function isPublicLocale(value: string): value is PublicLocale {
  return PUBLIC_LOCALES.includes(value as PublicLocale);
}

export function localizedPath(locale: PublicLocale, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (locale === DEFAULT_PUBLIC_LOCALE) {
    return normalizedPath;
  }

  return normalizedPath === "/" ? `/${locale}` : `/${locale}${normalizedPath}`;
}

export function stripLocalePrefix(pathname: string) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const [, maybeLocale, ...rest] = normalizedPath.split("/");

  if (!maybeLocale || !isPublicLocale(maybeLocale)) {
    return {
      locale: null,
      path: normalizedPath,
    };
  }

  return {
    locale: maybeLocale,
    path: rest.length > 0 ? `/${rest.join("/")}` : "/",
  };
}

export function buildLanguageAlternates(
  basePath: string,
  availableLocales: readonly PublicLocale[] = PUBLIC_LOCALES,
) {
  const xDefaultLocale = availableLocales.includes(DEFAULT_PUBLIC_LOCALE)
    ? DEFAULT_PUBLIC_LOCALE
    : (availableLocales[0] ?? DEFAULT_PUBLIC_LOCALE);
  const entries = availableLocales.map((locale) => [
    locale,
    localizedPath(locale, basePath),
  ]);

  return Object.fromEntries([
    ...entries,
    ["x-default", localizedPath(xDefaultLocale, basePath)],
  ]) as Record<string, string>;
}

export function getLanguageSwitcherLocales(
  locale: PublicLocale,
): readonly PublicLocale[] {
  return locale === DEFAULT_PUBLIC_LOCALE
    ? UKRAINE_PUBLIC_LOCALES
    : BULGARIA_PUBLIC_LOCALES;
}

export function selectPublicLocaleFromRequestContext(input: {
  acceptLanguage: string | null;
  countryCode: string | null;
}): PublicLocale {
  const countryCode = input.countryCode?.trim().toUpperCase();

  if (countryCode === "UA") return "uk";
  if (countryCode === "BG") return "bg";

  // Accept-Language cannot establish a product market. A missing or unsupported
  // country signal therefore fails closed to the Ukraine-market canonical
  // locale. Explicit /bg and /ru route intent is resolved separately.
  return DEFAULT_PUBLIC_LOCALE;
}

export function selectPublicLocaleFromRequestHeaders(headers: Headers) {
  return selectPublicLocaleFromRequestContext({
    acceptLanguage: headers.get("accept-language"),
    countryCode:
      headers.get("x-vercel-ip-country") ??
      headers.get("cf-ipcountry") ??
      headers.get("x-country-code"),
  });
}

export function selectPublicLocaleFromAcceptLanguage(
  acceptLanguage: string | null,
): PublicLocale {
  if (!acceptLanguage) return DEFAULT_PUBLIC_LOCALE;

  const rankedLanguages = acceptLanguage
    .split(",")
    .map((part) => {
      const [languageRange, ...parameters] = part.trim().split(";");
      const qParameter = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith("q="));
      const quality = qParameter ? Number(qParameter.slice(2)) : 1;

      return {
        language: languageRange.toLowerCase(),
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter(
      (entry) =>
        entry.language.length > 0 && entry.quality > 0 && entry.quality <= 1,
    )
    .sort((left, right) => right.quality - left.quality);

  for (const entry of rankedLanguages) {
    const baseLanguage = entry.language.split("-")[0];

    if (baseLanguage === "ua") return "uk";
    if (isPublicLocale(baseLanguage)) return baseLanguage;
  }

  return DEFAULT_PUBLIC_LOCALE;
}

export function getRootLocaleRedirectPath(
  acceptLanguage: string | null,
  countryCode: string | null = null,
) {
  return localizedPath(
    selectPublicLocaleFromRequestContext({ acceptLanguage, countryCode }),
    "/",
  );
}
