import LocalizedPrivacyNoticePage, {
  generateMetadata as generateLocalizedPrivacyMetadata,
} from "../[locale]/privacy/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

export function generateMetadata() {
  return generateLocalizedPrivacyMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default async function PrivacyNoticePage() {
  return LocalizedPrivacyNoticePage({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}
