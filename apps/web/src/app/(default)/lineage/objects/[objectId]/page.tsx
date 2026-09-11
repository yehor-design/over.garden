import PublicLineageObjectRoute, {
  generateMetadata as generateLocalizedMetadata,
} from "@/app/[locale]/lineage/objects/[objectId]/page";

import { DEFAULT_PUBLIC_LOCALE } from "@/lib/public-localization";

/**
 * The unprefixed half of the object passport.
 *
 * Both halves existed for every other public family; this one did not, so
 * `/bg/lineage/objects/{id}` had no route at all. The implementation moved to
 * `[locale]` and this file passes the default locale, which is the shape
 * `journal/[slug]` and the catalog families already use — and it is what stops
 * the unprefixed page reading the reader's cookie for a document the CDN
 * shares with everybody.
 */
interface RootPublicLineageObjectRouteProps {
  params: Promise<{ objectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export function generateMetadata({
  params,
}: RootPublicLineageObjectRouteProps) {
  return params.then(({ objectId }) =>
    generateLocalizedMetadata({
      params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, objectId }),
    }),
  );
}

export default async function RootPublicLineageObjectRoute({
  params,
  searchParams,
}: RootPublicLineageObjectRouteProps) {
  const { objectId } = await params;
  return PublicLineageObjectRoute({
    params: Promise.resolve({ locale: DEFAULT_PUBLIC_LOCALE, objectId }),
    searchParams,
  });
}
