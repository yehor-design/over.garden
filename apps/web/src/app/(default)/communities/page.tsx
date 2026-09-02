import { redirect } from "next/navigation";

import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
} from "@/lib/public-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  generateMetadata as generateLocalizedCommunityMetadata,
  renderCommunityDirectory,
} from "@/app/[locale]/communities/page";

export function generateMetadata() {
  return generateLocalizedCommunityMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default async function RootCommunityDirectoryRoute() {
  const locale = await getRequestInterfaceLocale();
  if (locale !== DEFAULT_PUBLIC_LOCALE) {
    redirect(localizedPath(locale, "/communities"));
  }
  return renderCommunityDirectory(DEFAULT_PUBLIC_LOCALE);
}
