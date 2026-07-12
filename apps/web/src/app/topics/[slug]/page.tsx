import TopicRoute, {
  generateMetadata as generateLocalizedTopicMetadata,
} from "../../[locale]/topics/[slug]/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

interface RootTopicRouteProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateMetadata({
  params,
  searchParams,
}: RootTopicRouteProps) {
  return Promise.all([params, searchParams ?? Promise.resolve({})]).then(
    ([{ slug }, query]) =>
      generateLocalizedTopicMetadata({
        params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
        searchParams: Promise.resolve(query),
      }),
  );
}

export default async function RootTopicRoute({
  params,
  searchParams,
}: RootTopicRouteProps) {
  const { slug } = await params;
  return TopicRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
    searchParams,
  });
}
