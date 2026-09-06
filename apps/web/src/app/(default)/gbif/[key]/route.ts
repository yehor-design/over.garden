import { resolveCatalogAliasRoute } from "@/app/catalog-alias-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return resolveCatalogAliasRoute({ scheme: "gbif", value: key, request });
}
