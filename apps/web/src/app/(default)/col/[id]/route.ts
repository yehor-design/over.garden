import { resolveCatalogAliasRoute } from "@/app/catalog-alias-route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return resolveCatalogAliasRoute({ scheme: "col", value: id, request });
}
