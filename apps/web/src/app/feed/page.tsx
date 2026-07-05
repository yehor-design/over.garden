import LocalizedFollowedFeedRoute, {
  generateMetadata as generateLocalizedFeedMetadata,
} from "../[locale]/feed/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

export function generateMetadata() {
  return generateLocalizedFeedMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default async function FollowedFeedRoute() {
  return LocalizedFollowedFeedRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}
