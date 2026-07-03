export const PUBLIC_LOCALES = ["uk", "bg", "ru"] as const;

export type PublicLocale = (typeof PUBLIC_LOCALES)[number];

export const DEFAULT_PUBLIC_LOCALE: PublicLocale = "uk";

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
  const entries = availableLocales.map((locale) => [
    locale,
    localizedPath(locale, basePath),
  ]);

  return Object.fromEntries([
    ...entries,
    ["x-default", localizedPath(DEFAULT_PUBLIC_LOCALE, basePath)],
  ]) as Record<string, string>;
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
    .filter((entry) => entry.language.length > 0)
    .sort((left, right) => right.quality - left.quality);

  for (const entry of rankedLanguages) {
    const baseLanguage = entry.language.split("-")[0];

    if (baseLanguage === "ua") return "uk";
    if (isPublicLocale(baseLanguage)) return baseLanguage;
  }

  return DEFAULT_PUBLIC_LOCALE;
}

export function getRootLocaleRedirectPath(acceptLanguage: string | null) {
  return localizedPath(
    selectPublicLocaleFromAcceptLanguage(acceptLanguage),
    "/",
  );
}
