import { redirect } from "next/navigation";

import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
} from "@/lib/public-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import LocalizedCommunityDetailRoute, {
  generateMetadata as generateLocalizedCommunityDetailMetadata,
} from "../../[locale]/communities/[slug]/page";

export const dynamic = "force-dynamic";

interface RootCommunityDetailRouteProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const COMMUNITY_QUERY_KEYS = new Set([
  "q",
  "kind",
  "cursor",
  "communityAction",
  "authIntent",
  "authControl",
]);

export async function generateMetadata({
  params,
}: RootCommunityDetailRouteProps) {
  const { slug } = await params;
  return generateLocalizedCommunityDetailMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
  });
}

export default async function RootCommunityDetailRoute({
  params,
  searchParams,
}: RootCommunityDetailRouteProps) {
  const [{ slug }, locale, query] = await Promise.all([
    params,
    getRequestInterfaceLocale(),
    searchParams ?? Promise.resolve({}),
  ]);
  if (locale !== DEFAULT_PUBLIC_LOCALE) {
    const path = localizedPath(locale, `/communities/${slug}`);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (!COMMUNITY_QUERY_KEYS.has(key)) continue;
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === "string") params.set(key, first);
    }
    redirect(params.size > 0 ? `${path}?${params}` : path);
  }
  return LocalizedCommunityDetailRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
    searchParams: Promise.resolve(query),
  });
}
