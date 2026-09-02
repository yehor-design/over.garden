import PublicJournalEntryRoute, {
  generateMetadata as generateLocalizedMetadata,
} from "@/app/[locale]/journal/[slug]/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

interface RootPublicJournalEntryRouteProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateMetadata({ params }: RootPublicJournalEntryRouteProps) {
  return params.then(({ slug }) =>
    generateLocalizedMetadata({
      params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
    }),
  );
}

export default async function RootPublicJournalEntryRoute({
  params,
  searchParams,
}: RootPublicJournalEntryRouteProps) {
  const { slug } = await params;
  return PublicJournalEntryRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
    searchParams,
  });
}
