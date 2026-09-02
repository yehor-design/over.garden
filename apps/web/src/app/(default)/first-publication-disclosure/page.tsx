import LocalizedFirstPublicationDisclosurePage, {
  generateMetadata as generateLocalizedFirstPublicationMetadata,
} from "@/app/[locale]/first-publication-disclosure/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

export function generateMetadata() {
  return generateLocalizedFirstPublicationMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default async function FirstPublicationDisclosurePage() {
  return LocalizedFirstPublicationDisclosurePage({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}
