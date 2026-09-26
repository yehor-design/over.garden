import LocalizedTermsPage, {
  generateMetadata as generateLocalizedTermsMetadata,
} from "@/app/[locale]/terms/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

export function generateMetadata() {
  return generateLocalizedTermsMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default async function TermsPage() {
  return LocalizedTermsPage({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}
