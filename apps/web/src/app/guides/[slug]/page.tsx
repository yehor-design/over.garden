import { permanentRedirect } from "next/navigation";

import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
} from "@/lib/public-localization";

interface LegacyGuideRedirectProps {
  params: Promise<{ slug: string }>;
}

export default async function LegacyGuideRedirect({
  params,
}: LegacyGuideRedirectProps) {
  const { slug } = await params;

  permanentRedirect(
    localizedPath(DEFAULT_PUBLIC_LOCALE, `/guides/${encodeURIComponent(slug)}`),
  );
}
