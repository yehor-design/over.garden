import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
  selectPublicLocaleFromRequestHeaders,
} from "@/lib/public-localization";
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
  const requestHeaders = await headers();
  const locale = selectPublicLocaleFromRequestHeaders(requestHeaders);

  if (locale !== DEFAULT_PUBLIC_LOCALE) {
    redirect(localizedPath(locale, "/"));
  }

  return renderLocalizedHomePage(DEFAULT_PUBLIC_LOCALE);
}
