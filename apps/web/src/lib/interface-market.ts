import {
  BULGARIA_PUBLIC_LOCALES,
  DEFAULT_PUBLIC_LOCALE,
  UKRAINE_PUBLIC_LOCALES,
  type PublicLocale,
} from "./public-localization";

export const INTERFACE_MARKETS = ["ukraine", "bulgaria"] as const;

export type InterfaceMarket = (typeof INTERFACE_MARKETS)[number];

export const DEFAULT_INTERFACE_MARKET: InterfaceMarket = "ukraine";
export const INTERFACE_MARKET_COOKIE_NAME = "overgarden_interface_market";
export const INTERFACE_MARKET_REQUEST_HEADER = "x-overgarden-interface-market";
export const INTERFACE_MARKET_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const INTERFACE_MARKET_CONFIG: Record<
  InterfaceMarket,
  {
    allowedLocales: readonly PublicLocale[];
    defaultLocale: PublicLocale;
  }
> = {
  ukraine: {
    allowedLocales: UKRAINE_PUBLIC_LOCALES,
    defaultLocale: DEFAULT_PUBLIC_LOCALE,
  },
  bulgaria: {
    allowedLocales: BULGARIA_PUBLIC_LOCALES,
    defaultLocale: "bg",
  },
};

type MarketCandidate = string | null | undefined;

export type InterfaceMarketResolutionSource =
  | "route"
  | "country"
  | "persisted"
  | "fallback";

export interface ResolvedInterfaceMarket {
  market: InterfaceMarket;
  source: InterfaceMarketResolutionSource;
}

export function normalizeInterfaceMarket(
  value: MarketCandidate,
): InterfaceMarket | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  return INTERFACE_MARKETS.includes(normalized as InterfaceMarket)
    ? (normalized as InterfaceMarket)
    : null;
}

export function normalizeInterfaceCountryCode(value: MarketCandidate) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length === 2 ? normalized : null;
}

export function readInterfaceCountryCode(headers: Headers) {
  return normalizeInterfaceCountryCode(
    headers.get("x-vercel-ip-country") ??
      headers.get("cf-ipcountry") ??
      headers.get("x-country-code"),
  );
}

export function resolveInterfaceMarket(input: {
  routeLocale?: string | null;
  countryCode?: string | null;
  persistedMarket?: MarketCandidate;
}): ResolvedInterfaceMarket {
  const routeLocale = input.routeLocale?.trim().toLowerCase();
  if (routeLocale === "bg" || routeLocale === "ru") {
    return { market: "bulgaria", source: "route" };
  }
  if (routeLocale === "uk") {
    return { market: "ukraine", source: "route" };
  }

  const countryCode = normalizeInterfaceCountryCode(input.countryCode);
  if (countryCode === "UA") {
    return { market: "ukraine", source: "country" };
  }
  if (countryCode === "BG") {
    return { market: "bulgaria", source: "country" };
  }

  const persistedMarket = normalizeInterfaceMarket(input.persistedMarket);
  if (persistedMarket) {
    return { market: persistedMarket, source: "persisted" };
  }

  return { market: DEFAULT_INTERFACE_MARKET, source: "fallback" };
}

export function getAllowedInterfaceLocales(
  market: InterfaceMarket,
): readonly PublicLocale[] {
  return INTERFACE_MARKET_CONFIG[market].allowedLocales;
}

export function getDefaultInterfaceLocale(
  market: InterfaceMarket,
): PublicLocale {
  return INTERFACE_MARKET_CONFIG[market].defaultLocale;
}

export function isInterfaceLocaleAllowed(
  market: InterfaceMarket,
  locale: PublicLocale,
) {
  return INTERFACE_MARKET_CONFIG[market].allowedLocales.includes(locale);
}
