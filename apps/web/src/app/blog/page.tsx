import BlogIndexRoute, {
  generateMetadata as generateLocalizedBlogIndexMetadata,
} from "../[locale]/blog/page";

import {
  DEFAULT_PUBLIC_LOCALE,
} from "@/lib/public-localization";

export function generateMetadata() {
  return generateLocalizedBlogIndexMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default function BlogIndexPage() {
  return BlogIndexRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}
