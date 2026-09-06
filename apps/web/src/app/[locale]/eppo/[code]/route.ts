import { resolveCatalogAliasRoute } from "@/app/catalog-alias-route";
import { isPublicLocale } from "@/lib/public-localization";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; code: string }> },
) {
  const { locale, code } = await params;
  if (!isPublicLocale(locale)) {
    return new Response(null, { status: 404 });
  }
  return resolveCatalogAliasRoute({ scheme: "eppo", value: code, request, locale });
}
