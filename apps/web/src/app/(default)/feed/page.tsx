import LocalizedFollowedFeedRoute, {
  generateMetadata as generateLocalizedFeedMetadata,
} from "@/app/[locale]/feed/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

export function generateMetadata() {
  return generateLocalizedFeedMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

interface FollowedFeedRouteProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FollowedFeedRoute({
  searchParams,
}: FollowedFeedRouteProps) {
  return LocalizedFollowedFeedRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
    searchParams,
  });
}
