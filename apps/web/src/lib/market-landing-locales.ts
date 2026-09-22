import type { PublicLocale } from "@/lib/public-localization";

/**
 * The languages each market landing is written in (ADR-0029: a locale prefix
 * only where a translation of the main content exists).
 *
 * It lives in `lib` rather than beside the landings' text because the proxy
 * reads it: the interface language follows the reader (ADR-0032 D1), and a
 * reader whose language has no translation of a landing must be given the
 * landing in a language it has — not the not-found page inside a 200, which
 * is what `/markets/ukraine` served a Bulgarian reader until OVE-467.
 */
export type MarketLandingMarket = "ukraine" | "bulgaria";

export const MARKET_LANDING_LOCALES: Record<
  MarketLandingMarket,
  readonly PublicLocale[]
> = {
  ukraine: ["uk"],
  bulgaria: ["bg", "ru"],
};

const MARKET_LANDING_PATH = /^\/markets\/([a-z-]+)$/u;

/**
 * The languages the page at a locale-free path is written in, or `null` when
 * the path is not one whose translations are partial — every other public
 * page exists in all three.
 */
export function contentLocalesForPath(
  path: string,
): readonly PublicLocale[] | null {
  const market = MARKET_LANDING_PATH.exec(path)?.[1];
  if (!market || !(market in MARKET_LANDING_LOCALES)) return null;
  return MARKET_LANDING_LOCALES[market as MarketLandingMarket];
}

/** The language to render a page in for a reader of `locale`. */
export function contentLocaleForReader(
  path: string,
  locale: PublicLocale,
): PublicLocale {
  const available = contentLocalesForPath(path);
  if (!available || available.includes(locale)) return locale;
  return available[0]!;
}
