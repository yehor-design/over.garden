import LocalizedSupportPage, {
  generateMetadata as localizedMetadata,
} from "@/app/[locale]/support/page";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export async function generateMetadata() {
  return localizedMetadata({
    params: Promise.resolve({ locale: await getRequestInterfaceLocale() }),
  });
}

export default async function SupportPage() {
  return LocalizedSupportPage({
    params: Promise.resolve({ locale: await getRequestInterfaceLocale() }),
  });
}
