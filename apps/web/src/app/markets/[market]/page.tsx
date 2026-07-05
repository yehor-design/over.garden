import MarketLandingRoute, {
  generateMetadata as generateLocalizedMarketMetadata,
} from "../../[locale]/markets/[market]/page";

import {
  DEFAULT_PUBLIC_LOCALE,
} from "@/lib/public-localization";

interface LegacyMarketRedirectProps {
  params: Promise<{ market: string }>;
}

export function generateMetadata({ params }: LegacyMarketRedirectProps) {
  return params.then(({ market }) =>
    generateLocalizedMarketMetadata({
      params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, market }),
    }),
  );
}

export default async function MarketPage({
  params,
}: LegacyMarketRedirectProps) {
  const { market } = await params;

  return MarketLandingRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, market }),
  });
}
