import { redirect } from "next/navigation";

import { buildPublicObjectCatalogHref } from "@/components/public/public-object-catalog";
import {
  DEFAULT_PUBLIC_LOCALE,
  type PublicLocale,
} from "@/lib/public-localization";
import { normalizePublicObjectCatalogRequest } from "@/server/public-object-catalog-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  generateMetadata as generateLocalizedObjectsMetadata,
  renderPublicObjectsPage,
} from "@/app/[locale]/objects/page";

export async function generateMetadata() {
  return generateLocalizedObjectsMetadata({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE }),
  });
}

export default async function RootObjectsRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const [locale, query] = await Promise.all([
    getRequestInterfaceLocale(),
    searchParams ?? Promise.resolve({}),
  ]);
  const request = normalizePublicObjectCatalogRequest(query);

  if (locale !== DEFAULT_PUBLIC_LOCALE) {
    redirect(buildPublicObjectCatalogHref(locale as PublicLocale, request));
  }

  return renderPublicObjectsPage(DEFAULT_PUBLIC_LOCALE, query);
}
