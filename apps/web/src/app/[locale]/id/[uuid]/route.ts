import { resolveCatalogAliasRoute } from "@/app/catalog-alias-route";
import { isPublicLocale } from "@/lib/public-localization";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; uuid: string }> },
) {
  const { locale, uuid } = await params;
  if (!isPublicLocale(locale)) {
    return new Response(null, { status: 404 });
  }
  return resolveCatalogAliasRoute({ scheme: "id", value: uuid, request, locale });
}
