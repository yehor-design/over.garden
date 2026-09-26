import LocalizedCookiesPage, {
  generateMetadata as generateLocalizedCookiesMetadata,
} from "@/app/[locale]/cookies/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

export function generateMetadata() {
  return generateLocalizedCookiesMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default async function CookiesPage() {
  return LocalizedCookiesPage({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}
