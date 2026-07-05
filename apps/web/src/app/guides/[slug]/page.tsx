import GuideRoute, {
  generateMetadata as generateLocalizedGuideMetadata,
} from "../../[locale]/guides/[slug]/page";

import {
  DEFAULT_PUBLIC_LOCALE,
} from "@/lib/public-localization";

interface LegacyGuideRedirectProps {
  params: Promise<{ slug: string }>;
}

export function generateMetadata({ params }: LegacyGuideRedirectProps) {
  return params.then(({ slug }) =>
    generateLocalizedGuideMetadata({
      params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
    }),
  );
}

export default async function GuidePage({
  params,
}: LegacyGuideRedirectProps) {
  const { slug } = await params;

  return GuideRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
  });
}
