import { redirect } from "next/navigation";

import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
} from "@/lib/public-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  generateMetadata as generateLocalizedHomeMetadata,
  renderLocalizedHomePage,
} from "./[locale]/page";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return generateLocalizedHomeMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default async function RootLocalePage() {
  const locale = await getRequestInterfaceLocale();

  if (locale !== DEFAULT_PUBLIC_LOCALE) {
    redirect(localizedPath(locale, "/"));
  }

  return renderLocalizedHomePage(DEFAULT_PUBLIC_LOCALE);
}
