import LocalizedWishlistRoute, {
  generateMetadata as generateLocalizedWishlistMetadata,
} from "@/app/[locale]/wishlist/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

export function generateMetadata() {
  return generateLocalizedWishlistMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

interface WishlistRouteProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WishlistRoute({
  searchParams,
}: WishlistRouteProps) {
  return LocalizedWishlistRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
    searchParams,
  });
}
