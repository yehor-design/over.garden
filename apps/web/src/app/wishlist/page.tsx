import LocalizedWishlistRoute, {
  generateMetadata as generateLocalizedWishlistMetadata,
} from "../[locale]/wishlist/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

export function generateMetadata() {
  return generateLocalizedWishlistMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default async function WishlistRoute() {
  return LocalizedWishlistRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}
