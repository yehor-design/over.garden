import TopicRoute, {
  generateMetadata as generateLocalizedTopicMetadata,
} from "../../[locale]/topics/[slug]/page";

import { redirect } from "next/navigation";

import { buildLocalizedInterfaceTarget } from "@/lib/interface-route-policy";
import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export const dynamic = "force-dynamic";

interface RootTopicRouteProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: RootTopicRouteProps) {
  const [{ slug }, query, locale] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
    getRequestInterfaceLocale(),
  ]);
  return generateLocalizedTopicMetadata({
    params: Promise.resolve({ locale, slug }),
    searchParams: Promise.resolve(query),
  });
}

export default async function RootTopicRoute({
  params,
  searchParams,
}: RootTopicRouteProps) {
  const [{ slug }, query, locale] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
    getRequestInterfaceLocale(),
  ]);
  if (locale !== DEFAULT_PUBLIC_LOCALE) {
    const target = buildLocalizedInterfaceTarget({
      locale,
      pathname: `/topics/${slug}`,
      search: toSearchParams(query),
    });
    if (target) redirect(target);
  }

  return TopicRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
    searchParams: Promise.resolve(query),
  });
}

function toSearchParams(query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string") params.append(key, item);
    }
  }
  return params;
}
