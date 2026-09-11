import TopicRoute, {
  generateMetadata as generateLocalizedTopicMetadata,
} from "@/app/[locale]/topics/[slug]/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

interface RootTopicRouteProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: RootTopicRouteProps) {
  const [{ slug }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ]);
  // The route family decides the locale of the metadata, never the reader's
  // cookie. This is the unprefixed family, so it is the default locale — the
  // same rule the catalog routes already follow. Passing the interface locale
  // made the canonical address describe itself as a duplicate of itself
  // whenever a Bulgarian reader asked for it.
  return generateLocalizedTopicMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
    searchParams: Promise.resolve(query),
  });
}

export default async function RootTopicRoute({
  params,
  searchParams,
}: RootTopicRouteProps) {
  const [{ slug }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ]);
  // No locale redirect here. `/topics/{slug}` is a canonical address and
  // answers 200 to everyone (ADR-0029 D10); the site shell offers the other
  // locale to a reader who arrives in the wrong one. This was a second copy of
  // the proxy's geo-307, living inside the page.
  return TopicRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
    searchParams: Promise.resolve(query),
  });
}
