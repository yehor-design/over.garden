import { resolveCatalogAliasRoute } from "@/app/catalog-alias-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  return resolveCatalogAliasRoute({ scheme: "eppo", value: code, request });
}
