import { resolveCatalogAliasRoute } from "@/app/catalog-alias-route";
import { isPublicLocale } from "@/lib/public-localization";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; key: string }> },
) {
  const { locale, key } = await params;
  if (!isPublicLocale(locale)) {
    return new Response(null, { status: 404 });
  }
  return resolveCatalogAliasRoute({ scheme: "gbif", value: key, request, locale });
}
