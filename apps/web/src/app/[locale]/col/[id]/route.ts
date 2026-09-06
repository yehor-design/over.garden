import { resolveCatalogAliasRoute } from "@/app/catalog-alias-route";
import { isPublicLocale } from "@/lib/public-localization";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const { locale, id } = await params;
  if (!isPublicLocale(locale)) {
    return new Response(null, { status: 404 });
  }
  return resolveCatalogAliasRoute({ scheme: "col", value: id, request, locale });
}
