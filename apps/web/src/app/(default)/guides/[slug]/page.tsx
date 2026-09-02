import GuideRoute, {
  generateMetadata as generateLocalizedGuideMetadata,
} from "@/app/[locale]/guides/[slug]/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

interface LegacyGuideRedirectProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateMetadata({
  params,
  searchParams,
}: LegacyGuideRedirectProps) {
  return Promise.all([params, searchParams ?? Promise.resolve({})]).then(
    ([{ slug }, query]) =>
      generateLocalizedGuideMetadata({
        params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
        searchParams: Promise.resolve(query),
      }),
  );
}

export default async function GuidePage({
  params,
  searchParams,
}: LegacyGuideRedirectProps) {
  const { slug } = await params;

  return GuideRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
    searchParams,
  });
}
