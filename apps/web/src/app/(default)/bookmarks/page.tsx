import LocalizedBookmarksRoute, {
  generateMetadata as generateLocalizedBookmarksMetadata,
} from "@/app/[locale]/bookmarks/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

interface BookmarksRouteProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateMetadata() {
  return generateLocalizedBookmarksMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default async function BookmarksRoute({
  searchParams,
}: BookmarksRouteProps) {
  return LocalizedBookmarksRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
    searchParams,
  });
}
