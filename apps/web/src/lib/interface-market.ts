import {
  DEFAULT_PUBLIC_LOCALE,
  INTERFACE_LOCALE_CHOICES,
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
  // Both markets offer all three languages; what differs is the one a reader
  // who has chosen nothing starts in.
  ukraine: {
    allowedLocales: INTERFACE_LOCALE_CHOICES,
    defaultLocale: DEFAULT_PUBLIC_LOCALE,
  },
  bulgaria: {
    allowedLocales: INTERFACE_LOCALE_CHOICES,
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
  // The locale prefix no longer names a market. It used to: `/bg` and `/ru`
  // meant Bulgaria and `/uk` meant Ukraine, which was true only while each
  // market had its own languages. Now every market offers all three, so a
  // reader in Ukraine reading in Russian would have been moved to the
  // Bulgarian market by the prefix alone, and a reader in Bulgaria who chose
  // Ukrainian would have lost the language control that got them there. Where
  // the reader is, and what they were told last time, decide it.
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

/**
 * The market a language is the default of.
 *
 * For a document with no reader — a prerendered locale shell, the last-resort
 * error page — this is the only honest market to claim. Every other caller has
 * a request and should resolve the reader's own market from it.
 */
export function marketWithDefaultInterfaceLocale(
  locale: PublicLocale,
): InterfaceMarket {
  return (
    INTERFACE_MARKETS.find(
      (market) => INTERFACE_MARKET_CONFIG[market].defaultLocale === locale,
    ) ?? DEFAULT_INTERFACE_MARKET
  );
}

export function isInterfaceLocaleAllowed(
  market: InterfaceMarket,
  locale: PublicLocale,
) {
  return INTERFACE_MARKET_CONFIG[market].allowedLocales.includes(locale);
}
