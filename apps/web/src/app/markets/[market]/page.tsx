import { permanentRedirect } from "next/navigation";

import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
} from "@/lib/public-localization";

interface LegacyMarketRedirectProps {
  params: Promise<{ market: string }>;
}

export default async function LegacyMarketRedirect({
  params,
}: LegacyMarketRedirectProps) {
  const { market } = await params;

  permanentRedirect(
    localizedPath(
      DEFAULT_PUBLIC_LOCALE,
      `/markets/${encodeURIComponent(market)}`,
    ),
  );
}
