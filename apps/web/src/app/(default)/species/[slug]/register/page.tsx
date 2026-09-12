import { redirect } from "next/navigation";

import { publicCatalogRegisterHubPath } from "@/lib/catalog/addresses";
import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
  type PublicLocale,
} from "@/lib/public-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  generateMetadata as generateLocalizedRegisterHubMetadata,
  renderPublicRegisterHubPage,
} from "@/app/[locale]/species/[slug]/register/page";

interface RootRegisterHubRouteProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: RootRegisterHubRouteProps) {
  const { slug } = await params;
  return generateLocalizedRegisterHubMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, slug }),
  });
}

/** `/species/{species}/register` without a prefix, which is the Ukrainian address. */
export default async function RootRegisterHubRoute({
  params,
}: RootRegisterHubRouteProps) {
  const [{ slug }, locale] = await Promise.all([
    params,
    getRequestInterfaceLocale(),
  ]);

  if (locale !== DEFAULT_PUBLIC_LOCALE) {
    redirect(
      localizedPath(
        locale as PublicLocale,
        publicCatalogRegisterHubPath(slug),
      ),
    );
  }

  return renderPublicRegisterHubPage(DEFAULT_PUBLIC_LOCALE, slug);
}
